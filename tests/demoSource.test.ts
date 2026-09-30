import { describe, expect, it, vi } from 'vitest';
import { createRng } from '../src/data/demo';
import { parseSnapshot } from '../src/data/validate';
import { DemoSource } from '../server/demo';

const agents = [
  { id: 'default', displayName: 'default' },
  { id: 'writer', displayName: 'writer' },
];

describe('DemoSource', () => {
  it('starts with a valid, all-idle snapshot in config order', () => {
    const src = new DemoSource(agents, { now: () => Date.UTC(2026, 9, 1, 10, 15), rng: createRng(1) });
    const snap = src.snapshot();
    expect(parseSnapshot(snap)).toEqual({ ok: true, value: snap });
    expect(snap.agents.map((a) => [a.id, a.state])).toEqual([
      ['default', 'idle'],
      ['writer', 'idle'],
    ]);
    expect(snap.gateway.running).toBe(true);
    expect(snap.agents[0]!.nextRunAt).toBe('2026-10-01T11:00:00.000Z');
  });

  it('notifies listeners on change and records last runs', () => {
    let t = Date.UTC(2026, 9, 1, 10, 0);
    const src = new DemoSource(agents, { now: () => t, rng: createRng(9) });
    const listener = vi.fn();
    src.onChange(listener);

    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      t += 1000;
      src.tick();
      for (const a of src.snapshot().agents) {
        seen.add(a.state);
        if (a.state === 'working') expect(a.currentTask).toMatch(/^Demo job \d+$/);
        if (a.state === 'celebrating') expect(a.lastRun?.status).toBe('success');
        if (a.state === 'error') expect(a.lastRun?.status).toBe('failed');
      }
    }
    expect(listener).toHaveBeenCalled();
    expect(parseSnapshot(listener.mock.calls.at(-1)![0]).ok).toBe(true);
    expect(seen.size).toBe(5);
  });

  it('re-sends an unchanged snapshot only after the keepalive interval', () => {
    let t = 0;
    // Long generator intervals, so nothing changes and only the keepalive can fire.
    const src = new DemoSource(agents, {
      now: () => t,
      rng: createRng(2),
      keepaliveMs: 5000,
      minIntervalSeconds: 100,
      maxIntervalSeconds: 200,
    });
    const listener = vi.fn();
    src.onChange(listener);
    t = 1000;
    src.tick();
    expect(listener).not.toHaveBeenCalled();
    t = 5000;
    src.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].generatedAt).toBe(new Date(5000).toISOString());
    expect(listener.mock.calls[0]![0].agents.map((a: { state: string }) => a.state)).toEqual(['idle', 'idle']);
  });
});
