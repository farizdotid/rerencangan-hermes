/**
 * Office layout: room size and furniture slots. Positions live here as data,
 * not inside scene-building code, so desks can later be assigned per agent.
 *
 * Coordinates: floor is the XZ plane centered at the origin. The two cutaway
 * walls stand on the back edges (min X and min Z), facing the camera.
 */

export interface RoomSpec {
  /** Size along X. */
  width: number;
  /** Size along Z. */
  depth: number;
  wallHeight: number;
  wallThickness: number;
}

export interface Slot {
  id: string;
  x: number;
  z: number;
  /** Rotation around Y in radians. 0 = monitor faces +Z (towards the camera). */
  rotationY: number;
}

export interface Point {
  x: number;
  z: number;
}

export interface OfficeLayout {
  room: RoomSpec;
  desks: Slot[];
  /** One bed per desk, in the same order; agents nap here after a long idle. */
  beds: Slot[];
  /**
   * Optional waypoints per desk (same order) for the walk to bed, so agents
   * go around other desks instead of through them. Empty means walk straight.
   */
  walkVia?: Point[][];
  serverRack: Slot;
}

/** Footprint half-sizes used for bounds and overlap checks. */
export const DESK_FOOTPRINT = { halfWidth: 1.0, halfDepth: 1.1 } as const;
export const RACK_FOOTPRINT = { halfWidth: 0.45, halfDepth: 0.4 } as const;
export const BED_FOOTPRINT = { halfWidth: 0.6, halfDepth: 1.1 } as const;

/** Spacing and margins used by createLayout. */
const DESK_SPACING = 3.3;
const DESKS_PER_ROW = 6;
const DESK_ROW_SPACING = 3.4;
const BED_SPACING = 1.45;
const MIN_ROOM = { width: 14, depth: 10 } as const;

/**
 * Office for `agentCount` agents: one desk and one bed each. Desks sit in
 * rows along the back wall (up to six per row), beds along the left wall,
 * the server rack in the back-left corner. The room grows to fit.
 */
export function createLayout(agentCount: number): OfficeLayout {
  const n = Math.max(0, Math.floor(agentCount));
  const cols = Math.max(1, Math.min(n, DESKS_PER_ROW));
  const rows = Math.max(1, Math.ceil(n / DESKS_PER_ROW));

  // Left of the desks: room for the rack and the walk to the beds.
  const deskLeftMargin = 4.5;
  const width = Math.max(MIN_ROOM.width, Math.ceil((deskLeftMargin + (cols - 1) * DESK_SPACING + 1.6) / 2) * 2);
  const depth = Math.max(
    MIN_ROOM.depth,
    Math.ceil(6.4 + Math.max(0, n - 1) * BED_SPACING),
    Math.ceil(5.4 + (rows - 1) * DESK_ROW_SPACING),
  );
  const halfW = width / 2;
  const halfD = depth / 2;

  const desks: Slot[] = [];
  const beds: Slot[] = [];
  const walkVia: Point[][] = [];
  // With several rows, walk out along the aisle in front of the row, then
  // down the corridor left of the desks, so no one walks through a desk.
  const corridorX = -halfW + deskLeftMargin - 1.5;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / DESKS_PER_ROW);
    const col = i % DESKS_PER_ROW;
    const desk: Slot = {
      id: `desk-${i + 1}`,
      x: -halfW + deskLeftMargin + col * DESK_SPACING,
      z: -halfD + 2.8 + row * DESK_ROW_SPACING,
      rotationY: 0,
    };
    desks.push(desk);
    const aisleZ = desk.z + DESK_FOOTPRINT.halfDepth + 0.6;
    walkVia.push(rows > 1 ? [{ x: desk.x + 0.62, z: aisleZ }, { x: corridorX, z: aisleZ }] : []);
    // Along the left wall, pillow towards the wall, foot end facing the room.
    beds.push({ id: `bed-${i + 1}`, x: -halfW + 1.15, z: -halfD + 5.4 + i * BED_SPACING, rotationY: Math.PI / 2 });
  }

  return {
    room: { width, depth, wallHeight: 3, wallThickness: 0.2 },
    desks,
    beds,
    walkVia,
    serverRack: { id: 'rack', x: -halfW + 0.8, z: -halfD + 0.8, rotationY: Math.PI / 2 },
  };
}

/** Layout used before the first snapshot arrives, and in tests. */
export const DEFAULT_LAYOUT: OfficeLayout = createLayout(3);

interface Box {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function footprintBox(slot: Slot, halfWidth: number, halfDepth: number): Box {
  // Axis-aligned bounds of the rotated footprint (conservative for odd angles).
  const c = Math.abs(Math.cos(slot.rotationY));
  const s = Math.abs(Math.sin(slot.rotationY));
  const hx = halfWidth * c + halfDepth * s;
  const hz = halfWidth * s + halfDepth * c;
  return { id: slot.id, minX: slot.x - hx, maxX: slot.x + hx, minZ: slot.z - hz, maxZ: slot.z + hz };
}

function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
}

/** Returns a list of problems; empty means the layout is usable. */
export function validateLayout(layout: OfficeLayout): string[] {
  const errors: string[] = [];
  const { room } = layout;

  if (!(room.width > 0 && room.depth > 0 && room.wallHeight > 0 && room.wallThickness >= 0)) {
    errors.push('room dimensions must be positive');
    return errors;
  }

  const slots = [...layout.desks, ...layout.beds, layout.serverRack];
  const allFinite = slots.every(
    (s) => Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.rotationY),
  );
  if (!allFinite) {
    errors.push('slot coordinates must be finite numbers');
    return errors;
  }

  const seen = new Set<string>();
  for (const slot of slots) {
    if (seen.has(slot.id)) errors.push(`duplicate slot id "${slot.id}"`);
    seen.add(slot.id);
  }

  const boxes = [
    ...layout.desks.map((d) => footprintBox(d, DESK_FOOTPRINT.halfWidth, DESK_FOOTPRINT.halfDepth)),
    ...layout.beds.map((b) => footprintBox(b, BED_FOOTPRINT.halfWidth, BED_FOOTPRINT.halfDepth)),
    footprintBox(layout.serverRack, RACK_FOOTPRINT.halfWidth, RACK_FOOTPRINT.halfDepth),
  ];

  const halfW = room.width / 2;
  const halfD = room.depth / 2;
  for (const box of boxes) {
    if (box.minX < -halfW || box.maxX > halfW || box.minZ < -halfD || box.maxZ > halfD) {
      errors.push(`slot "${box.id}" is outside the room`);
    }
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (overlaps(a, b)) errors.push(`slots "${a.id}" and "${b.id}" overlap`);
    }
  }

  return errors;
}
