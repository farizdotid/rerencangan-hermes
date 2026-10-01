import { describe, expect, it } from 'vitest';
import { POSE_KEYS, applyPosture, blendPose, liePose, poseFor, walkPose } from '../src/avatar/pose';
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

describe('applyPosture', () => {
  const seated = { seated: 1, walk: 0, lie: 0 };
  const walking = { seated: 0, walk: 1, lie: 0 };
  const lying = { seated: 0, walk: 0, lie: 1 };

  it('is the state pose itself while seated', () => {
    for (const s of AGENT_STATES) {
      const p = poseFor(s, 3, 0.2, -1);
      expect(applyPosture(p, seated, 0, 3, 0.2)).toEqual(p);
    }
  });

  it('walking shows feet, swings arms, and turns the monitor off', () => {
    const p = applyPosture(poseFor('working', 1, 0, 0), walking, Math.PI / 2, 1, 0);
    expect(p.feet).toBe(1);
    expect(p.screen).toBe(0);
    expect(p.handLZ).not.toBeCloseTo(p.handRZ);
    expect(p.footLZ).toBeCloseTo(-p.footRZ);
  });

  it('lying is flat on the back, eyes shut, with zzz, even for an idle agent', () => {
    const p = applyPosture(poseFor('idle', 1, 0, 0), lying, 0, 1, 0);
    expect(p.lean).toBeCloseTo(-Math.PI / 2);
    expect(p.eyes).toBeLessThan(0.3);
    expect(p.zzz).toBe(1);
    expect(p.feet).toBe(0);
    expect(p.screen).toBe(0);
  });

  it('keeps status overlays from the state pose', () => {
    const p = applyPosture(poseFor('offline', 1, 0, 0), lying, 0, 1, 0);
    expect(p.dim).toBeLessThan(1);
  });

  it('blends linearly between postures', () => {
    const sp = poseFor('idle', 0, 0, 0);
    const half = applyPosture(sp, { seated: 0.5, walk: 0.5, lie: 0 }, 0, 0, 0);
    const w = walkPose(0);
    expect(half.lean).toBeCloseTo((sp.lean + w.lean) / 2);
    expect(half.feet).toBeCloseTo(0.5);
  });

  it('produces finite numbers everywhere', () => {
    const p = applyPosture(poseFor('error', 7, 1, -1), { seated: 0.2, walk: 0.3, lie: 0.5 }, 1.3, 7, 1);
    for (const k of POSE_KEYS) expect(Number.isFinite(p[k])).toBe(true);
    expect(liePose(0, 0).lean).toBeCloseTo(-Math.PI / 2);
  });
});
