import { describe, expect, it } from 'vitest';
import { POSE_KEYS, blendPose, poseFor } from '../src/avatar/pose';
import { oneHot } from '../src/avatar/stateMachine';
import { AGENT_STATES } from '../src/data/types';

describe('poseFor', () => {
  it('gives each state a clear signature', () => {
    const at = (s: (typeof AGENT_STATES)[number]) => poseFor(s, 1.234, 0, -1);
    expect(at('working').screen).toBe(1);
    expect(at('working').handLZ).toBeLessThan(-0.4); // hands on keyboard
    expect(at('error').alarm).toBe(1);
    expect(at('offline').zzz).toBe(1);
    expect(at('offline').dim).toBeLessThan(1);
    expect(at('idle').alarm).toBe(0);
    expect(at('idle').zzz).toBe(0);
    expect(at('celebrating').handLY).toBeGreaterThan(0.9); // arms up
    expect(at('celebrating').cheer).toBe(1);
  });

  it('celebrating jumps and error shakes over time', () => {
    const times = Array.from({ length: 60 }, (_, i) => i * 0.037);
    expect(Math.max(...times.map((t) => poseFor('celebrating', t, 0, 0).rootY))).toBeGreaterThan(0.2);
    expect(Math.max(...times.map((t) => Math.abs(poseFor('error', t, 0, 0).shakeX)))).toBeGreaterThan(0.02);
    for (const t of times) expect(poseFor('idle', t, 0, 0).rootY).toBe(0);
  });

  it('returns finite numbers for every field', () => {
    for (const s of AGENT_STATES) {
      const p = poseFor(s, 12.5, 3.3, -0.8);
      for (const k of POSE_KEYS) expect(Number.isFinite(p[k])).toBe(true);
    }
  });
});

describe('blendPose', () => {
  it('equals the single pose when one weight is 1', () => {
    for (const s of AGENT_STATES) {
      expect(blendPose(oneHot(s), 2, 0.5, -1)).toEqual(poseFor(s, 2, 0.5, -1));
    }
  });

  it('interpolates linearly between two states', () => {
    const w = { ...oneHot('idle'), idle: 0.5, offline: 0.5 };
    const a = poseFor('idle', 0, 0, 0);
    const b = poseFor('offline', 0, 0, 0);
    const p = blendPose(w, 0, 0, 0);
    for (const k of POSE_KEYS) expect(p[k]).toBeCloseTo((a[k] + b[k]) / 2);
  });

  it('reuses the output object', () => {
    const out = blendPose(oneHot('idle'), 0, 0, 0);
    expect(blendPose(oneHot('working'), 0, 0, 0, out)).toBe(out);
    expect(out.screen).toBe(1);
  });
});
