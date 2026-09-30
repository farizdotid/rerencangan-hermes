import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseSnapshot } from '../src/data/validate';
import type { CommandKey } from '../server/sources/allowlist';
import type { CliResult } from '../server/sources/hermesCli';
import { HermesSource, MAX_INTERVAL_MS, MIN_INTERVAL_MS, type CommandRunner } from '../server/sources/hermesSource';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../server/sources/fixtures', name), 'utf8');
const STATUS = fixture('cron-status.running.txt');
const LIST = fixture('cron-list.running.txt');
const EMPTY_LIST = 'Scheduled Jobs (profile: writer)\n\nNo scheduled jobs.';

const agents = [
  { id: 'default', displayName: 'default' },
  { id: 'writer', displayName: 'writer' },
];

function runnerFrom(outputs: (key: CommandKey, profile: string | null) => CliResult): {
  run: CommandRunner;
  calls: string[];
} {
  const calls: string[] = [];
  const run: CommandRunner = async (key, profile) => {
    calls.push(profile ? `${key}:${profile}` : key);
    return outputs(key, profile);
  };
  return { run, calls };
}

const ok = (stdout: string): CliResult => ({ ok: true, stdout });
const NOW = Date.parse('2026-09-30T16:05:00Z');

describe('HermesSource', () => {
  it('turns fixture output into a valid snapshot', async () => {
    const { run, calls } = runnerFrom((key, p) => ok(key === 'cron-status' ? STATUS : p === 'default' ? LIST : EMPTY_LIST));
    const src = new HermesSource(agents, run, { now: () => NOW, log: () => {} });
    await src.poll();

    expect(calls).toEqual(['cron-status', 'cron-list:default', 'cron-list:writer']);
    const snap = src.snapshot();
    expect(parseSnapshot(snap)).toEqual({ ok: true, value: snap });
    expect(snap.gateway).toEqual({ running: true, heartbeatAgeSeconds: 9 });
    expect(snap.agents).toEqual([
      {
        id: 'default',
        displayName: 'default',
        state: 'working',
        currentTask: 'Daily article job',
        nextRunAt: '2026-10-01T23:00:00+07:00',
        activeJobs: 1,
      },
      { id: 'writer', displayName: 'writer', state: 'idle', activeJobs: 0 },
    ]);
  });

  it('never leaks ids, PIDs, or raw output into the snapshot', async () => {
    const { run } = runnerFrom((key) => ok(key === 'cron-status' ? STATUS : LIST));
    const src = new HermesSource(agents, run, { now: () => NOW, log: () => {} });
    await src.poll();
    const json = JSON.stringify(src.snapshot());
    for (const s of ['12345', 'a1b2c3d4e5f6', '0123456789abcdef', 'every day', 'Deliver', 'local']) {
      expect(json).not.toContain(s);
    }
  });

  it('starts offline + unknown before the first poll', () => {
    const src = new HermesSource(agents, runnerFrom(() => ok('')).run, { log: () => {} });
    expect(src.snapshot().agents.every((a) => a.state === 'offline' && a.unknown)).toBe(true);
  });

  it('shows everyone offline and unknown when hermes cannot be run', async () => {
    const log = vi.fn();
    const src = new HermesSource(agents, runnerFrom(() => ({ ok: false, reason: 'not-found' })).run, { now: () => NOW, log });
    await src.poll();
    await src.poll();
    expect(src.snapshot().gateway.running).toBe(false);
    expect(src.snapshot().agents.every((a) => a.state === 'offline' && a.unknown)).toBe(true);
    // One message per failing command, not one per poll.
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.map((c) => c[0])).toContain('cron-status: failed (not-found)');
  });

  it('marks a profile unknown (idle) when its output is not understood', async () => {
    const { run } = runnerFrom((key, p) => ok(key === 'cron-status' ? STATUS : p === 'writer' ? 'garbage' : LIST));
    const src = new HermesSource(agents, run, { now: () => NOW, log: () => {} });
    await src.poll();
    expect(src.snapshot().agents[1]).toMatchObject({ id: 'writer', state: 'idle', unknown: true });
    expect(src.snapshot().agents[0]!.state).toBe('working');
  });

  it('survives a runner that throws', async () => {
    const run: CommandRunner = async () => {
      throw new Error('boom');
    };
    const src = new HermesSource(agents, run, { now: () => NOW, log: () => {} });
    await expect(src.poll()).resolves.toBeUndefined();
    expect(src.snapshot().gateway.running).toBe(false);
  });

  it('never runs two polls at once', async () => {
    let active = 0;
    let maxActive = 0;
    const run: CommandRunner = async (key) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return ok(key === 'cron-status' ? STATUS : LIST);
    };
    const src = new HermesSource(agents, run, { now: () => NOW, log: () => {} });
    await Promise.all([src.poll(), src.poll(), src.poll()]);
    expect(maxActive).toBe(1);
  });

  it('broadcasts every completed poll with a fresh timestamp', async () => {
    let list = LIST;
    let t = NOW;
    const { run } = runnerFrom((key) => ok(key === 'cron-status' ? STATUS : list));
    const src = new HermesSource(agents, run, { now: () => t, log: () => {} });
    const listener = vi.fn();
    src.onChange(listener);

    await src.poll();
    t += 7000;
    await src.poll();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]![0].generatedAt).toBe(new Date(t).toISOString());

    // The run finishes (assumed wording): both agents now celebrate.
    list = LIST.replace(/Execution: running.*$/m, 'Execution: success');
    t += 7000;
    await src.poll();
    expect(src.snapshot().agents[0]!.state).toBe('celebrating');

    // After the celebrate window it settles to idle.
    t += 3 * 60_000;
    await src.poll();
    expect(src.snapshot().agents[0]!.state).toBe('idle');
  });

  it('shows a stopped gateway as offline for everyone (assumed wording)', async () => {
    const { run } = runnerFrom((key) => ok(key === 'cron-status' ? 'Gateway is not running' : LIST));
    const src = new HermesSource(agents, run, { now: () => NOW, log: () => {} });
    await src.poll();
    expect(src.snapshot().gateway.running).toBe(false);
    expect(src.snapshot().agents.map((a) => [a.state, a.unknown])).toEqual([
      ['offline', undefined],
      ['offline', undefined],
    ]);
  });

  it('polls on a timer within 5-10 s and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      const { run, calls } = runnerFrom((key) => ok(key === 'cron-status' ? STATUS : LIST));
      const src = new HermesSource(agents, run, { intervalMs: 1, now: () => NOW, log: () => {} });
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
