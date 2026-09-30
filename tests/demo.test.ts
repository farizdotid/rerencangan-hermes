import { describe, expect, it } from 'vitest';
import { DemoGenerator, createRng, pickState } from '../src/data/demo';
import { AGENT_STATES, isAgentState } from '../src/data/types';

describe('createRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('pickState', () => {
  it('never returns the current state and can reach every other state', () => {
    const rng = createRng(1);
    for (const current of AGENT_STATES) {
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        const s = pickState(current, rng);
        expect(s).not.toBe(current);
        seen.add(s);
      }
      expect(seen.size).toBe(AGENT_STATES.length - 1);
    }
  });
});

describe('DemoGenerator', () => {
  const ids = ['a', 'b', 'c'];

  it('starts idle and changes nothing before the first interval', () => {
    const g = new DemoGenerator(ids, 0, { rng: createRng(7), minIntervalSeconds: 2, maxIntervalSeconds: 4 });
    expect(g.snapshot()).toEqual(ids.map((id) => ({ id, state: 'idle' })));
    expect(g.tick(1.9)).toEqual([]);
  });

  it('changes every agent within the max interval, to valid new states', () => {
    const g = new DemoGenerator(ids, 0, { rng: createRng(7), minIntervalSeconds: 2, maxIntervalSeconds: 4 });
    const changes = g.tick(4);
    expect(changes.map((c) => c.id).sort()).toEqual(ids);
    for (const c of changes) {
      expect(isAgentState(c.state)).toBe(true);
      expect(c.state).not.toBe('idle');
      expect(g.stateOf(c.id)).toBe(c.state);
    }
  });

  it('keeps changing over time', () => {
    const g = new DemoGenerator(ids, 0, { rng: createRng(3) });
    let total = 0;
    for (let t = 0; t <= 60; t += 0.5) total += g.tick(t).length;
    // 3 agents, 2-6 s intervals, 60 s => at least 3 * 10 changes.
    expect(total).toBeGreaterThanOrEqual(30);
  });
});
