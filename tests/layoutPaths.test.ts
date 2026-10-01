import { describe, expect, it } from 'vitest';
import { bedPlaces, deskPlaces } from '../src/avatar/route';
import {
  BED_FOOTPRINT,
  DESK_FOOTPRINT,
  NIGHTSTAND_FOOTPRINT,
  RACK_FOOTPRINT,
  WARDROBE_FOOTPRINT,
  createLayout,
  validateLayout,
  type OfficeLayout,
  type Slot,
} from '../src/scene/layout';

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
/** Roughly half an avatar's width; it must clear the door posts by this much. */
const AVATAR_RADIUS = 0.25;

function walkPoints(l: OfficeLayout, i: number): { x: number; z: number }[] {
  return [deskPlaces(l.desks[i]!, SEAT).standOut, ...(l.walkVia?.[i] ?? []), bedPlaces(l.beds[i]!).approach];
}

describe('createLayout', () => {
  it('matches the three-agent layout', () => {
    const l = createLayout(3);
    expect(l.room).toEqual({ width: 15, depth: 10, wallHeight: 3, wallThickness: 0.2 });
    expect(l.desks.map((d) => [d.x, d.z])).toEqual([
      [expect.closeTo(-0.7), -2.2],
      [expect.closeTo(2.6), -2.2],
      [expect.closeTo(5.9), -2.2],
    ]);
    expect(l.beds.map((b) => [b.x, b.z])).toEqual([
      [-6.35, expect.closeTo(-3.1)],
      [-6.35, expect.closeTo(-1.2)],
      [-6.35, expect.closeTo(0.7)],
    ]);
    expect([l.serverRack.x, l.serverRack.z]).toEqual([expect.closeTo(-2.7), -4.2]);
    expect(l.bedroom).toMatchObject({ partitionX: -3.5, doorZ: expect.closeTo(-1.2), doorWidth: 1.3 });
  });

  for (const n of [1, 3, 4, 7, 12]) {
    it(`keeps beds, bedside tables, and the wardrobe in the bedroom, desks and rack outside, with ${n} agent(s)`, () => {
      const l = createLayout(n);
      const bedroom = l.bedroom!;
      expect(bedroom.nightstands).toHaveLength(n);
      for (const s of [...l.beds, ...bedroom.nightstands, bedroom.wardrobe]) expect(s.x, s.id).toBeLessThan(bedroom.partitionX);
      for (const s of [...l.desks, l.serverRack]) expect(s.x, s.id).toBeGreaterThan(bedroom.partitionX);
    });
  }

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
        ...l.bedroom!.nightstands.map((s) => box(s, NIGHTSTAND_FOOTPRINT.halfWidth, NIGHTSTAND_FOOTPRINT.halfDepth, 0)),
        box(l.bedroom!.wardrobe, WARDROBE_FOOTPRINT.halfWidth, WARDROBE_FOOTPRINT.halfDepth, 0),
      ];
      l.desks.forEach((desk, i) => {
        const points = walkPoints(l, i);
        for (let k = 0; k + 1 < points.length; k++) {
          const [a, b] = [points[k]!, points[k + 1]!];
          const blocked = furniture.filter((f) => f.id !== desk.id && hits(a.x, a.z, b.x, b.z, f)).map((f) => f.id);
          expect(blocked, `${desk.id} -> bed-${i + 1}, leg ${k}`).toEqual([]);
        }
      });
    });
  }

  // The partition is solid except for the doorway, so every walk must cross it there.
  for (let n = 1; n <= 12; n++) {
    it(`walks every agent through the doorway with ${n} agent(s)`, () => {
      const l = createLayout(n);
      const { partitionX, doorZ, doorWidth } = l.bedroom!;
      l.desks.forEach((desk, i) => {
        const points = walkPoints(l, i);
        let crossings = 0;
        for (let k = 0; k + 1 < points.length; k++) {
          const [a, b] = [points[k]!, points[k + 1]!];
          if ((a.x - partitionX) * (b.x - partitionX) >= 0) continue;
          crossings++;
          const z = a.z + ((partitionX - a.x) / (b.x - a.x)) * (b.z - a.z);
          expect(Math.abs(z - doorZ), `${desk.id}, leg ${k}`).toBeLessThan(doorWidth / 2 - AVATAR_RADIUS);
        }
        expect(crossings, desk.id).toBe(1);
      });
    });
  }
});

describe('createLayout decor', () => {
  const MONITOR_HALF_WIDTH = 0.45;

  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 12]) {
    it(`places windows, a shelf, and a plant without clashes for ${n} agent(s)`, () => {
      const l = createLayout(n);
      const decor = l.decor!;
      expect(validateLayout(l)).toEqual([]);
      expect(decor.windows.some((w) => w.wall === 'side')).toBe(true);
      expect(decor.shelves).toHaveLength(1);
      expect(decor.plants).toHaveLength(1);
      // Back windows sit between monitors in the first row, never right behind one.
      const row0 = l.desks.filter((d) => d.z === l.desks[0]?.z);
      for (const w of decor.windows.filter((w) => w.wall === 'back')) {
        for (const d of row0) {
          expect(Math.abs(w.at - d.x), `${w.id} vs ${d.id}`).toBeGreaterThan(w.width / 2 + MONITOR_HALF_WIDTH - 0.01);
        }
      }
    });
  }

  it('gives a room with desks at least one back-wall window', () => {
    for (let n = 1; n <= 12; n++) expect(createLayout(n).decor!.windows.some((w) => w.wall === 'back')).toBe(true);
  });
});

describe('validateLayout wall items', () => {
  it('rejects wall items that overlap or do not fit', () => {
    const l = createLayout(3);
    const win = l.decor!.windows[0]!;
    const shelf = l.decor!.shelves[0]!;
    const bad = (decor: NonNullable<typeof l.decor>) => validateLayout({ ...l, decor });
    expect(bad({ ...l.decor!, shelves: [{ ...shelf, at: win.at }] })).toContain(
      `wall items "${win.id}" and "${shelf.id}" overlap`,
    );
    expect(bad({ ...l.decor!, windows: [{ ...win, at: 100 }] })).toContain(`wall item "${win.id}" does not fit on the back wall`);
    expect(bad({ ...l.decor!, windows: [{ ...win, top: 99 }] })).toContain(`wall item "${win.id}" does not fit on the back wall`);
    expect(bad({ ...l.decor!, windows: [{ ...win, width: 0 }] })).toContain(`wall item "${win.id}" has invalid dimensions`);
    // Same spot on different walls is fine.
    expect(bad({ ...l.decor!, windows: [win], shelves: [{ ...shelf, wall: 'side', at: win.at }] })).toEqual([]);
  });

  it('rejects a plant that overlaps furniture', () => {
    const l = createLayout(3);
    const desk = l.desks[0]!;
    expect(validateLayout({ ...l, decor: { ...l.decor!, plants: [{ id: 'p', x: desk.x, z: desk.z, rotationY: 0 }] } })).toContain(
      `slots "${desk.id}" and "p" overlap`,
    );
  });
});
