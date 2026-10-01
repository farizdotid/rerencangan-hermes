import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseSnapshot } from '../src/data/validate';
import type { CommandKey } from '../server/sources/allowlist';
import type { CliResult } from '../server/sources/hermesCli';
import { HermesSource, MAX_INTERVAL_MS, MIN_INTERVAL_MS, type CommandRunner } from '../server/sources/hermesSource';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../server/sources/fixtures', name), 'utf8');
const PROFILES = fixture('profile-list.txt');
const STATUS = fixture('cron-status.running.txt');
const RUNNING = fixture('cron-list.running.txt');
const COMPLETED = fixture('cron-list.completed.txt');
const SESSIONS = fixture('sessions-list.txt');
// Synthetic: a profile without jobs, and a sessions list with one session active right now.
const NO_JOBS = 'Scheduled Jobs (profile: writer)\n\nNo scheduled jobs.';
const ACTIVE_SESSIONS = 'Title   Workspace   Last Active   ID\nSome chat   home   just now   20260101_000000_abcdef';
const IDS = ['default', 'writer', 'research', 'planner'];

const ok = (stdout: string): CliResult => ({ ok: true, stdout });
const NOW = Date.parse('2026-09-30T16:05:00Z');

type Outputs = (key: CommandKey, profile: string | null) => CliResult;

function runner(outputs: Outputs): { run: CommandRunner; calls: string[] } {
  const calls: string[] = [];
  const run: CommandRunner = async (key, profile) => {
    calls.push(profile ? `${key}:${profile}` : key);
    return outputs(key, profile);
  };
  return { run, calls };
}

/** A machine like the owner's: four profiles, cron jobs only on default. */
const machine =
  (over: Partial<Record<string, string>> = {}): Outputs =>
  (key, p) => {
    const k = p ? `${key}:${p}` : key;
    if (over[k] !== undefined) return ok(over[k]!);
    if (key === 'profile-list') return ok(PROFILES);
    if (key === 'cron-status') return ok(STATUS);
    if (key === 'cron-list') return ok(p === 'default' ? RUNNING : NO_JOBS);
    return ok(SESSIONS);
  };

const quiet = { now: () => NOW, log: () => {} };

describe('HermesSource discovery', () => {
  it('discovers profiles and checks each one with cron list and sessions list', async () => {
    const { run, calls } = runner(machine());
    const src = new HermesSource(run, quiet);
    await src.poll();
    expect(calls).toEqual([
      'profile-list',
      'cron-status',
      ...IDS.flatMap((id) => [`cron-list:${id}`, `sessions-list:${id}`]),
    ]);
    const snap = src.snapshot();
    expect(parseSnapshot(snap)).toEqual({ ok: true, value: snap });
    expect(snap.agents.map((a) => [a.id, a.state])).toEqual([
      ['default', 'working'],
      ['writer', 'idle'],
      ['research', 'idle'],
      ['planner', 'idle'],
    ]);
    expect(snap.agents[0]).toMatchObject({ currentTask: 'Daily article job', nextRunAt: '2026-10-01T23:00:00+07:00' });
  });

  it('applies config overrides: names, order, hidden', async () => {
    const { run } = runner(machine());
    const src = new HermesSource(run, {
      ...quiet,
      overrides: [
        { id: 'planner', displayName: 'Planner' },
        { id: 'research', displayName: 'research', hidden: true },
      ],
    });
    await src.poll();
    expect(src.snapshot().agents.map((a) => [a.id, a.displayName])).toEqual([
      ['planner', 'Planner'],
      ['default', 'default'],
      ['writer', 'writer'],
    ]);
  });

  it('re-reads the profile list only every few polls', async () => {
    const { run, calls } = runner(machine());
    const src = new HermesSource(run, { ...quiet, discoverEvery: 3 });
    for (let i = 0; i < 7; i++) await src.poll();
    expect(calls.filter((c) => c === 'profile-list')).toHaveLength(3);
  });

  it('keeps the last known roster when the profile list cannot be read', async () => {
    let fail = false;
    const { run } = runner((key, p) => (fail && key === 'profile-list' ? { ok: false, reason: 'timeout' } : machine()(key, p)));
    const src = new HermesSource(run, { ...quiet, discoverEvery: 1 });
    await src.poll();
    fail = true;
    await src.poll();
    expect(src.snapshot().agents).toHaveLength(4);
  });

  it('falls back to configured agents, or just "default", before anything is discovered', async () => {
    const { run } = runner(() => ({ ok: false, reason: 'not-found' }));
    const withConfig = new HermesSource(run, { ...quiet, fallback: [{ id: 'writer', displayName: 'W' }] });
    expect(withConfig.snapshot().agents.map((a) => a.id)).toEqual(['writer']);
    const bare = new HermesSource(run, quiet);
    await bare.poll();
    expect(bare.snapshot().agents.map((a) => [a.id, a.state, a.unknown])).toEqual([['default', 'offline', true]]);
  });
});

describe('HermesSource states', () => {
  it('a session active right now makes a profile without cron jobs work', async () => {
    const { run } = runner(machine({ 'sessions-list:writer': ACTIVE_SESSIONS }));
    const src = new HermesSource(run, quiet);
    await src.poll();
    expect(src.snapshot().agents.find((a) => a.id === 'writer')?.state).toBe('working');
    // Older sessions (50 min ago at best in the fixture) do not count.
    expect(src.snapshot().agents.find((a) => a.id === 'research')?.state).toBe('idle');
  });

  it('celebrates a run that finished in the last two minutes, using "Last run"', async () => {
    const { run } = runner(machine({ 'cron-list:default': COMPLETED }));
    const lastRun = Date.parse('2026-10-01T00:40:00.123456+07:00');
    const src = new HermesSource(run, { ...quiet, now: () => lastRun + 60_000 });
    await src.poll();
    expect(src.snapshot().agents[0]).toMatchObject({
      state: 'celebrating',
      lastRun: { status: 'success', at: '2026-10-01T00:40:00.123456+07:00' },
    });
    const later = new HermesSource(run, { ...quiet, now: () => lastRun + 10 * 60_000 });
    await later.poll();
    expect(later.snapshot().agents[0]!.state).toBe('idle');
  });

  it('shows a profile offline when its own gateway is stopped', async () => {
    const stopped = PROFILES.replace(/(writer\s+provider\/model-a\s+)running/, '$1stopped');
    const { run } = runner(machine({ 'profile-list': stopped }));
    const src = new HermesSource(run, quiet);
    await src.poll();
    expect(src.snapshot().agents.map((a) => a.state)).toEqual(['working', 'offline', 'idle', 'idle']);
    expect(src.snapshot().gateway.running).toBe(true);
  });

  it('marks a profile unknown (idle) only when neither cron nor sessions output is understood', async () => {
    const { run } = runner(machine({ 'cron-list:writer': 'garbage', 'sessions-list:writer': 'garbage' }));
    const src = new HermesSource(run, quiet);
    await src.poll();
    expect(src.snapshot().agents[1]).toMatchObject({ id: 'writer', state: 'idle', unknown: true });
    expect(src.snapshot().agents[2]!.unknown).toBeUndefined();
  });

  it('never leaks ids, titles, models, or raw output into the snapshot', async () => {
    const { run } = runner(machine({ 'cron-list:default': COMPLETED }));
    const src = new HermesSource(run, quiet);
    await src.poll();
    const json = JSON.stringify(src.snapshot());
    // The PID (12345) as a whole number; it also appears inside the run timestamp's microseconds.
    expect(json).not.toMatch(/\b12345\b/);
    for (const s of ['b2c3d4e5f6a1', 'fedcba98', 'Chat session', 'provider/model-a', 'every day', 'cron_']) {
      expect(json).not.toContain(s);
    }
  });
});

describe('HermesSource robustness', () => {
  it('shows everyone offline and unknown when hermes cannot be run, logging each failure once', async () => {
    const log = vi.fn();
    const src = new HermesSource(runner(() => ({ ok: false, reason: 'not-found' })).run, { now: () => NOW, log });
    await src.poll();
    await src.poll();
    expect(src.snapshot().gateway.running).toBe(false);
    expect(src.snapshot().agents.every((a) => a.state === 'offline' && a.unknown)).toBe(true);
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      'profile-list: failed (not-found)',
      'cron-status: failed (not-found)',
      'cron-list (default): failed (not-found)',
      'sessions-list (default): failed (not-found)',
    ]);
  });

  it('survives a runner that throws', async () => {
    const run: CommandRunner = async () => {
      throw new Error('boom');
    };
    const src = new HermesSource(run, quiet);
    await expect(src.poll()).resolves.toBeUndefined();
    expect(src.snapshot().gateway.running).toBe(false);
  });

  it('never runs two polls at once', async () => {
    let active = 0;
    let maxActive = 0;
    const base = machine();
    const run: CommandRunner = async (key, p) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return base(key, p);
    };
    const src = new HermesSource(run, quiet);
    await Promise.all([src.poll(), src.poll(), src.poll()]);
    expect(maxActive).toBe(1);
  });

  it('broadcasts every completed poll with a fresh timestamp', async () => {
    let t = NOW;
    const { run } = runner(machine());
    const src = new HermesSource(run, { ...quiet, now: () => t });
    const listener = vi.fn();
    src.onChange(listener);
    await src.poll();
    t += 10_000;
    await src.poll();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]![0].generatedAt).toBe(new Date(t).toISOString());
  });

  it('polls on a timer within 5-10 s and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      const { run, calls } = runner(machine());
      const src = new HermesSource(run, { ...quiet, intervalMs: 1 });
      src.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.filter((c) => c === 'cron-status')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS - 1);
      expect(calls.filter((c) => c === 'cron-status')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls.filter((c) => c === 'cron-status')).toHaveLength(2);
      src.stop();
      await vi.advanceTimersByTimeAsync(MAX_INTERVAL_MS * 3);
      expect(calls.filter((c) => c === 'cron-status')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
