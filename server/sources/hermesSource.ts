import type { Snapshot } from '../../src/data/types';
import type { AgentConfig } from '../config';
import type { StatusSource } from '../source';
import type { CommandKey } from './allowlist';
import type { CliResult } from './hermesCli';
import { JobMemory } from './jobMemory';
import { toAgentStatus, type AgentFacts } from './mapStatus';
import { parseCronList } from './parse/cronList';
import { parseCronStatus } from './parse/cronStatus';
import { parseProfileList } from './parse/profileList';
import { mostRecentActivity, parseSessionsList } from './parse/sessionsList';
import { resolveRoster } from './roster';

export type CommandRunner = (key: CommandKey, profile: string | null, signal: AbortSignal) => Promise<CliResult>;

export interface HermesSourceOptions {
  /** Agents to show until (or unless) `hermes profile list` can be read. */
  fallback?: readonly AgentConfig[];
  /** Display names, order, and hidden flags from config.local.json. */
  overrides?: readonly AgentConfig[];
  /** Poll interval; clamped to 5-10 s (PRD section 7, phase 4). */
  intervalMs?: number;
  /** Re-read the profile list every this many polls. */
  discoverEvery?: number;
  now?: () => number;
  /** Where to report command failures. Profile ids may appear; output never does. */
  log?: (message: string) => void;
}

export const MIN_INTERVAL_MS = 5_000;
export const MAX_INTERVAL_MS = 10_000;
/** A session active this recently counts as the agent working. */
export const ACTIVE_SESSION_SECONDS = 120;

/**
 * Read-only collector: polls allowlisted Hermes commands and turns their
 * output into snapshots. Profiles are discovered with `hermes profile list`;
 * each one is checked with `cron list` and `sessions list`. Polls never
 * overlap; the last snapshot is cached and every completed poll is broadcast,
 * so clients always know how fresh the data is.
 */
export class HermesSource implements StatusSource {
  private readonly run: CommandRunner;
  private readonly overrides: readonly AgentConfig[];
  private readonly intervalMs: number;
  private readonly discoverEvery: number;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly memory = new Map<string, JobMemory>();
  private readonly listeners = new Set<(s: Snapshot) => void>();
  private readonly lastError = new Map<string, string>();

  private roster: AgentConfig[];
  private profileGateway = new Map<string, boolean | null>();
  private pollCount = 0;
  private current: Snapshot;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private running = false;

  constructor(run: CommandRunner, opts: HermesSourceOptions = {}) {
    this.run = run;
    this.overrides = opts.overrides ?? [];
    this.intervalMs = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, opts.intervalMs ?? 10_000));
    this.discoverEvery = Math.max(1, Math.floor(opts.discoverEvery ?? 6));
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.warn(`rerencangan-hermes: ${m}`));
    const fallback = opts.fallback?.filter((a) => !a.hidden) ?? [];
    this.roster = fallback.length > 0 ? fallback.map((a) => ({ ...a })) : [{ id: 'default', displayName: 'default' }];

    // Until the first poll finishes nothing is known: everyone offline, flagged unknown.
    this.current = {
      generatedAt: new Date(this.now()).toISOString(),
      gateway: { running: false },
      agents: this.roster.map((a) => ({ id: a.id, displayName: a.displayName, state: 'offline', unknown: true, activeJobs: 0 })),
    };
  }

  snapshot(): Snapshot {
    return this.current;
  }

  onChange(listener: (s: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
  }

  /** Runs one poll; if one is already running, waits for it instead of starting another. */
  poll(): Promise<void> {
    this.inFlight ??= this.pollOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async loop(): Promise<void> {
    await this.poll();
    if (this.running) this.timer = setTimeout(() => void this.loop(), this.intervalMs);
  }

  private async exec(key: CommandKey, profile: string | null, signal: AbortSignal): Promise<string | null> {
    const label = profile ? `${key} (${profile})` : key;
    let result: CliResult;
    try {
      result = await this.run(key, profile, signal);
    } catch {
      result = { ok: false, reason: 'error' };
    }
    if (result.ok) {
      if (this.lastError.delete(label)) this.log(`${label}: ok again`);
      return result.stdout;
    }
    if (result.reason === 'aborted') return null;
    const why = result.reason === 'exit' ? `exit code ${result.exitCode}` : result.reason;
    if (this.lastError.get(label) !== why) this.log(`${label}: failed (${why})`);
    this.lastError.set(label, why);
    return null;
  }

  private async discover(signal: AbortSignal): Promise<void> {
    const out = await this.exec('profile-list', null, signal);
    const list = out === null ? null : parseProfileList(out);
    if (!list?.recognized || list.profiles.length === 0) return; // keep the roster we have
    this.roster = resolveRoster(
      list.profiles.map((p) => p.id),
      this.overrides,
    );
    this.profileGateway = new Map(list.profiles.map((p) => [p.id, p.gatewayRunning]));
  }

  private memoryFor(id: string): JobMemory {
    let m = this.memory.get(id);
    if (!m) this.memory.set(id, (m = new JobMemory()));
    return m;
  }

  private async pollOnce(): Promise<void> {
    const abort = new AbortController();
    this.abort = abort;
    const signal = abort.signal;

    if (this.pollCount++ % this.discoverEvery === 0) await this.discover(signal);
    if (signal.aborted) return;

    const statusOut = await this.exec('cron-status', null, signal);
    const status = statusOut === null ? null : parseCronStatus(statusOut);
    const globalGateway = status?.recognized ? status.gatewayRunning : null;

    const facts: AgentFacts[] = [];
    for (const agent of this.roster) {
      if (signal.aborted) return;
      const cronOut = await this.exec('cron-list', agent.id, signal);
      const sessOut = await this.exec('sessions-list', agent.id, signal);
      const list = cronOut === null ? null : parseCronList(cronOut);
      const sessions = sessOut === null ? null : parseSessionsList(sessOut);

      const summary = list?.recognized ? this.memoryFor(agent.id).update(list, this.now()) : { activeJobs: 0 };
      const recent = sessions?.recognized ? mostRecentActivity(sessions) : null;
      const fact: AgentFacts = {
        id: agent.id,
        displayName: agent.displayName,
        // Each profile runs its own gateway; fall back to the scheduler's when unknown.
        gatewayRunning: this.profileGateway.get(agent.id) ?? globalGateway,
        understood: Boolean(list?.recognized || sessions?.recognized),
        hasActiveSession: recent !== null && recent <= ACTIVE_SESSION_SECONDS,
        ...summary,
      };
      facts.push(fact);
    }
    if (signal.aborted) return;

    // Forget memory for profiles that went away.
    const ids = new Set(this.roster.map((a) => a.id));
    for (const id of this.memory.keys()) if (!ids.has(id)) this.memory.delete(id);

    const now = this.now();
    const anyProfileGateway = [...this.profileGateway.values()].some((g) => g === true);
    const gateway: Snapshot['gateway'] = { running: globalGateway ?? anyProfileGateway };
    if (status?.heartbeatAgeSeconds !== undefined) gateway.heartbeatAgeSeconds = status.heartbeatAgeSeconds;

    this.current = { generatedAt: new Date(now).toISOString(), gateway, agents: facts.map((f) => toAgentStatus(f, now)) };
    for (const l of this.listeners) l(this.current);
  }
}
