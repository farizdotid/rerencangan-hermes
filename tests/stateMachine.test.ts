import { describe, expect, it } from 'vitest';
import { AvatarStateMachine, TRANSITION_SECONDS, oneHot, type StateWeights } from '../src/avatar/stateMachine';
import { AGENT_STATES } from '../src/data/types';

const sum = (w: StateWeights) => AGENT_STATES.reduce((s, k) => s + w[k], 0);

describe('AvatarStateMachine', () => {
  it('starts fully in the initial state', () => {
    const m = new AvatarStateMachine('idle');
    expect(m.weights()).toEqual(oneHot('idle'));
    expect(m.transitioning).toBe(false);
  });

  it('blends to the new state over TRANSITION_SECONDS', () => {
    const m = new AvatarStateMachine('idle');
    expect(m.set('working')).toBe(true);
    expect(m.transitioning).toBe(true);
    m.update(TRANSITION_SECONDS / 2);
    const mid = m.weights();
    expect(mid.idle).toBeCloseTo(0.5);
    expect(mid.working).toBeCloseTo(0.5);
    m.update(TRANSITION_SECONDS);
    expect(m.weights()).toEqual(oneHot('working'));
    expect(m.transitioning).toBe(false);
  });

  it('ignores setting the same state', () => {
    const m = new AvatarStateMachine('error');
    expect(m.set('error')).toBe(false);
    expect(m.transitioning).toBe(false);
  });

  it('retargets mid-transition without a jump', () => {
    const m = new AvatarStateMachine('idle');
    m.set('working');
    m.update(TRANSITION_SECONDS * 0.3);
    const before = m.weights();
    m.set('error');
    const after = m.weights();
    for (const s of AGENT_STATES) expect(after[s]).toBeCloseTo(before[s]);
    m.update(TRANSITION_SECONDS);
    expect(m.weights()).toEqual(oneHot('error'));
  });

  it('keeps weights summing to 1 under rapid random changes', () => {
    const m = new AvatarStateMachine('idle');
    for (let i = 0; i < 500; i++) {
      m.set(AGENT_STATES[i % AGENT_STATES.length]!);
      m.update(0.013 * (i % 7));
      const w = m.weights();
      expect(sum(w)).toBeCloseTo(1, 10);
      for (const s of AGENT_STATES) expect(w[s]).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it('ignores non-positive or invalid dt', () => {
    const m = new AvatarStateMachine('idle');
    m.set('offline');
    m.update(-1);
    m.update(Number.NaN);
    expect(m.weights()).toEqual(oneHot('idle'));
  });
});
