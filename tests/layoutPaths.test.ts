import { describe, expect, it } from 'vitest';
import { bedPlaces, deskPlaces } from '../src/avatar/route';
import { BED_FOOTPRINT, DESK_FOOTPRINT, RACK_FOOTPRINT, createLayout, validateLayout, type Slot } from '../src/scene/layout';

interface Box {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function box(slot: Slot, hw: number, hd: number, shrink: number): Box {
  const c = Math.abs(Math.cos(slot.rotationY));
  const s = Math.abs(Math.sin(slot.rotationY));
  const hx = hw * c + hd * s - shrink;
  const hz = hw * s + hd * c - shrink;
  return { id: slot.id, minX: slot.x - hx, maxX: slot.x + hx, minZ: slot.z - hz, maxZ: slot.z + hz };
}

/** Does segment a->b pass through the box? (Liang-Barsky clipping.) */
function hits(ax: number, az: number, bx: number, bz: number, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, q] of [
    [-dx, ax - b.minX],
    [dx, b.maxX - ax],
    [-dz, az - b.minZ],
    [dz, b.maxZ - az],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

const SEAT = { x: 0, y: 0.53, z: 0.55 };

describe('createLayout', () => {
  it('matches the hand-tuned three-agent layout', () => {
    const l = createLayout(3);
    expect(l.room).toEqual({ width: 14, depth: 10, wallHeight: 3, wallThickness: 0.2 });
    expect(l.desks.map((d) => [d.x, d.z])).toEqual([
      [-2.5, -2.2],
      [expect.closeTo(0.8), -2.2],
      [4.1, -2.2],
    ]);
    expect(l.beds.map((b) => [b.x, b.z])).toEqual([
      [-5.85, expect.closeTo(0.4)],
      [-5.85, expect.closeTo(1.85)],
      [-5.85, expect.closeTo(3.3)],
    ]);
    expect([l.serverRack.x, l.serverRack.z]).toEqual([-6.2, -4.2]);
  });

  for (let n = 0; n <= 12; n++) {
    it(`gives ${n} agent(s) a valid office with one desk and one bed each`, () => {
      const l = createLayout(n);
      expect(validateLayout(l)).toEqual([]);
      expect(l.desks).toHaveLength(n);
      expect(l.beds).toHaveLength(n);
    });
  }

  it('grows the room for more agents', () => {
    expect(createLayout(4).room.width).toBeGreaterThan(createLayout(3).room.width);
    expect(createLayout(8).room.depth).toBeGreaterThan(createLayout(3).room.depth);
  });

  // Avatars walk in a straight line from beside their chair to the foot of their bed.
  for (let n = 1; n <= 12; n++) {
    it(`keeps every walk to bed clear of furniture with ${n} agent(s)`, () => {
      const l = createLayout(n);
      // Shrink boxes a little: footprints are generous, and walking past an edge is fine.
      const furniture = [
        ...l.desks.map((d) => box(d, DESK_FOOTPRINT.halfWidth, DESK_FOOTPRINT.halfDepth, 0.15)),
        ...l.beds.map((b) => box(b, BED_FOOTPRINT.halfWidth, BED_FOOTPRINT.halfDepth, 0.05)),
        box(l.serverRack, RACK_FOOTPRINT.halfWidth, RACK_FOOTPRINT.halfDepth, 0),
      ];
      l.desks.forEach((desk, i) => {
        const points = [deskPlaces(desk, SEAT).standOut, ...(l.walkVia?.[i] ?? []), bedPlaces(l.beds[i]!).approach];
        for (let k = 0; k + 1 < points.length; k++) {
          const [a, b] = [points[k]!, points[k + 1]!];
          const blocked = furniture.filter((f) => f.id !== desk.id && hits(a.x, a.z, b.x, b.z, f)).map((f) => f.id);
          expect(blocked, `${desk.id} -> bed-${i + 1}, leg ${k}`).toEqual([]);
        }
      });
    });
  }
});
