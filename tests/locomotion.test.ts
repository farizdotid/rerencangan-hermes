import { describe, expect, it } from 'vitest';
import { Locomotion, WALK_SPEED, angleDelta, type Posture } from '../src/avatar/locomotion';
import { WALK_Y, bedPlaces, deskPlaces } from '../src/avatar/route';
import { DEFAULT_LAYOUT } from '../src/scene/layout';

const desk = deskPlaces(DEFAULT_LAYOUT.desks[0]!, { x: 0, y: 0.53, z: 0.55 });
const bed = bedPlaces(DEFAULT_LAYOUT.beds[0]!);
const DT = 1 / 60;

function run(loco: Locomotion, seconds: number, onFrame?: (l: Locomotion) => void): void {
  for (let t = 0; t < seconds; t += DT) {
    loco.update(DT);
    onFrame?.(loco);
  }
}

function settle(loco: Locomotion, onFrame?: (l: Locomotion) => void): number {
  let frames = 0;
  while (loco.moving && frames < 60 * 60) {
    loco.update(DT);
    onFrame?.(loco);
    frames++;
  }
  return frames * DT;
}

const sum = (p: Posture) => p.seated + p.walk + p.lie;

describe('routes', () => {
  it('puts the lying spot on the mattress and the approach at the foot end, on the floor', () => {
    expect(bed.lie.y).toBeGreaterThan(0.5);
    expect(bed.approach.y).toBe(WALK_Y);
    // Bed 1 is rotated 90°, so its foot end points to +X.
    expect(bed.approach.x).toBeGreaterThan(DEFAULT_LAYOUT.beds[0]!.x + 1);
    expect(desk.seat.y).toBe(0.53);
    expect(desk.standOut.y).toBe(WALK_Y);
  });
});

describe('Locomotion', () => {
  it('starts seated at the desk, not moving', () => {
    const l = new Locomotion(desk, bed);
    expect(l.posture).toEqual({ seated: 1, walk: 0, lie: 0 });
    expect([l.x, l.y, l.z]).toEqual([desk.seat.x, desk.seat.y, desk.seat.z]);
    expect(l.moving).toBe(false);
  });

  it('walks to the bed and lies down, in a sensible time', () => {
    const l = new Locomotion(desk, bed);
    l.goTo('bed');
    let maxStep = 0;
    let px = l.x;
    let pz = l.z;
    const time = settle(l, (s) => {
      expect(sum(s.posture)).toBeCloseTo(1, 9);
      maxStep = Math.max(maxStep, Math.hypot(s.x - px, s.z - pz));
      px = s.x;
      pz = s.z;
    });
    expect(l.posture).toEqual({ seated: 0, walk: 0, lie: 1 });
    expect(l.x).toBeCloseTo(bed.lie.x);
    expect(l.y).toBeCloseTo(bed.lie.y);
    expect(l.z).toBeCloseTo(bed.lie.z);
    expect(angleDelta(l.yaw, bed.lie.yaw)).toBeCloseTo(0);
    // No teleporting: every frame moves at most a little.
    expect(maxStep).toBeLessThan(WALK_SPEED * DT * 3);
    const dist = Math.hypot(bed.approach.x - desk.standOut.x, bed.approach.z - desk.standOut.z);
    expect(time).toBeGreaterThan(dist / WALK_SPEED);
    expect(time).toBeLessThan(dist / WALK_SPEED + 5);
  });

  it('walks back and sits down when work arrives', () => {
    const l = new Locomotion(desk, bed);
    l.goTo('bed');
    settle(l);
    l.goTo('desk');
    settle(l);
    expect(l.posture).toEqual({ seated: 1, walk: 0, lie: 0 });
    expect([l.x, l.y, l.z]).toEqual([desk.seat.x, desk.seat.y, desk.seat.z]);
    expect(angleDelta(l.yaw, desk.seat.yaw)).toBeCloseTo(0);
  });

  it('can turn around at any moment without jumping', () => {
    for (const cutAt of [0.2, 0.6, 2, 4, 5.5, 6.3]) {
      const l = new Locomotion(desk, bed);
      l.goTo('bed');
      run(l, cutAt);
      const before = { x: l.x, y: l.y, z: l.z, ...l.posture };
      l.goTo('desk');
      l.update(DT);
      expect(Math.hypot(l.x - before.x, l.z - before.z)).toBeLessThan(0.1);
      expect(Math.abs(l.posture.lie - before.lie)).toBeLessThan(0.1);
      settle(l, (s) => expect(sum(s.posture)).toBeCloseTo(1, 9));
      expect(l.posture.seated).toBe(1);
      expect(l.x).toBeCloseTo(desk.seat.x);
      expect(l.z).toBeCloseTo(desk.seat.z);
    }
  });

  it('can change its mind again on the way back', () => {
    const l = new Locomotion(desk, bed);
    l.goTo('bed');
    settle(l);
    l.goTo('desk');
    run(l, 1.5);
    l.goTo('bed');
    settle(l);
    expect(l.posture.lie).toBe(1);
    expect(l.x).toBeCloseTo(bed.lie.x);
  });

  it('stays at the desk when there is no bed', () => {
    const l = new Locomotion(desk, null);
    l.goTo('bed');
    expect(l.heading).toBe('desk');
    expect(l.moving).toBe(false);
  });

  it('ignores bad dt values', () => {
    const l = new Locomotion(desk, bed);
    l.goTo('bed');
    l.update(Number.NaN);
    l.update(-1);
    expect([l.x, l.z]).toEqual([desk.seat.x, desk.seat.z]);
  });
});

describe('angleDelta', () => {
  it('returns the shortest signed turn', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
  });
});
