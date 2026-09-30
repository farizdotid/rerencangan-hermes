import type { Snapshot } from '../../src/data/types';
import type { AgentConfig } from '../config';
import type { StatusSource } from '../source';
import type { CommandKey } from './allowlist';
import type { CliResult } from './hermesCli';
import { JobMemory } from './jobMemory';
import { toAgentStatus, type AgentFacts } from './mapStatus';
import { parseCronList } from './parse/cronList';
import { parseCronStatus } from './parse/cronStatus';

export type CommandRunner = (key: CommandKey, profile: string | null, signal: AbortSignal) => Promise<CliResult>;

export interface HermesSourceOptions {
  /** Poll interval; clamped to 5-10 s (PRD section 7, phase 4). */
  intervalMs?: number;
  now?: () => number;
  /** Where to report command failures. Profile ids may appear; output never does. */
  log?: (message: string) => void;
}

export const MIN_INTERVAL_MS = 5_000;
export const MAX_INTERVAL_MS = 10_000;

/**
 * Read-only collector: polls allowlisted Hermes commands and turns their
 * output into snapshots. Polls never overlap; the last snapshot is cached
 * and served until the next poll completes. Every completed poll is
 * broadcast, so clients always know how fresh the data is.
 */
export class HermesSource implements StatusSource {
  private readonly agents: readonly AgentConfig[];
  private readonly run: CommandRunner;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly memory = new Map<string, JobMemory>();
  private readonly listeners = new Set<(s: Snapshot) => void>();
  private readonly lastError = new Map<string, string>();

  private current: Snapshot;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private running = false;

  constructor(agents: readonly AgentConfig[], run: CommandRunner, opts: HermesSourceOptions = {}) {
    this.agents = agents;
    this.run = run;
    this.intervalMs = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, opts.intervalMs ?? 7_000));
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.warn(`rerencangan-hermes: ${m}`));
    for (const a of agents) this.memory.set(a.id, new JobMemory());

    // Until the first poll finishes nothing is known: everyone offline, flagged unknown.
    this.current = {
      generatedAt: new Date(this.now()).toISOString(),
      gateway: { running: false },
      agents: agents.map((a) => ({ id: a.id, displayName: a.displayName, state: 'offline', unknown: true, activeJobs: 0 })),
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

  private async pollOnce(): Promise<void> {
    const abort = new AbortController();
    this.abort = abort;

    const statusOut = await this.exec('cron-status', null, abort.signal);
    const status = statusOut === null ? null : parseCronStatus(statusOut);
    const gatewayRunning = status?.recognized ? status.gatewayRunning : null;

    const facts: AgentFacts[] = [];
    for (const agent of this.agents) {
      if (abort.signal.aborted) return;
      const out = await this.exec('cron-list', agent.id, abort.signal);
      const list = out === null ? null : parseCronList(out);
      const understood = list?.recognized ?? false;
      const summary = list && understood ? this.memory.get(agent.id)!.update(list, this.now()) : { activeJobs: 0 };
      facts.push({ id: agent.id, displayName: agent.displayName, gatewayRunning, understood, ...summary });
    }
    if (abort.signal.aborted) return;

    const now = this.now();
    const gateway: Snapshot['gateway'] = { running: gatewayRunning === true };
    if (status?.heartbeatAgeSeconds !== undefined) gateway.heartbeatAgeSeconds = status.heartbeatAgeSeconds;
    const agents = facts.map((f) => toAgentStatus(f, now));

    this.current = { generatedAt: new Date(now).toISOString(), gateway, agents };
    for (const l of this.listeners) l(this.current);
  }
}
