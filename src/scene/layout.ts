/**
 * Office layout: room size and furniture slots. Positions live here as data,
 * not inside scene-building code, so desks can later be assigned per agent.
 *
 * Coordinates: floor is the XZ plane centered at the origin. The two cutaway
 * walls stand on the back edges (min X and min Z), facing the camera. A low
 * partition with a doorway splits the floor into a bedroom (min X side) and
 * the work area.
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

/** Something hung on a wall. `at` is the centre along the wall: X on the back wall, Z on the side wall. */
export interface WallItem {
  id: string;
  wall: 'back' | 'side';
  at: number;
  width: number;
  /** Height range above the floor. */
  bottom: number;
  top: number;
}

export interface Decor {
  windows: WallItem[];
  shelves: WallItem[];
  /** Potted plants standing on the floor. */
  plants: Slot[];
}

/** The bedroom on the min X side, behind a low partition wall with a doorway. */
export interface Bedroom {
  /** Centre line of the partition, along Z. Everything with a smaller X is bedroom. */
  partitionX: number;
  /** Centre and width of the doorway in the partition. */
  doorZ: number;
  doorWidth: number;
  /** One bedside table (with a lamp) next to each bed's pillow. */
  nightstands: Slot[];
  wardrobe: Slot;
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
  decor?: Decor;
  bedroom?: Bedroom;
}

/** Footprint half-sizes used for bounds and overlap checks. */
export const DESK_FOOTPRINT = { halfWidth: 1.0, halfDepth: 1.1 } as const;
export const RACK_FOOTPRINT = { halfWidth: 0.45, halfDepth: 0.4 } as const;
export const BED_FOOTPRINT = { halfWidth: 0.6, halfDepth: 1.1 } as const;
export const PLANT_FOOTPRINT = { halfWidth: 0.35, halfDepth: 0.35 } as const;
export const NIGHTSTAND_FOOTPRINT = { halfWidth: 0.22, halfDepth: 0.22 } as const;
export const WARDROBE_FOOTPRINT = { halfWidth: 0.6, halfDepth: 0.28 } as const;

/** The low wall between bedroom and work area. */
export const PARTITION = { thickness: 0.14, height: 0.9 } as const;

/** Window and shelf sizes used by createLayout. */
export const WINDOW = { width: 1.4, bottom: 1.2, top: 2.4 } as const;
export const SHELF = { width: 1.0, bottom: 1.6, top: 2.05 } as const;

/** Spacing and margins used by createLayout. */
const DESK_SPACING = 3.3;
const DESKS_PER_ROW = 6;
const DESK_ROW_SPACING = 3.4;
const MIN_ROOM = { width: 14, depth: 10 } as const;
/** Bedroom width, from the side wall to the partition. */
const BEDROOM_WIDTH = 4;
/** Room between beds for a bedside table. */
const BED_SPACING = 1.9;
/** First bed from the back wall: leaves room for the wardrobe and the first bedside table. */
const FIRST_BED_Z = 1.9;
/** First desk column from the partition: leaves room for the rack and a corridor. */
const DESK_OFFSET = 2.8;
const DOOR_WIDTH = 1.3;

/**
 * Office for `agentCount` agents: one desk and one bed each. Beds line the
 * left wall of the bedroom; desks sit in rows along the back wall of the work
 * area (up to six per row), with the server rack in its back-left corner. The
 * room grows to fit.
 */
export function createLayout(agentCount: number): OfficeLayout {
  const n = Math.max(0, Math.floor(agentCount));
  const cols = Math.max(1, Math.min(n, DESKS_PER_ROW));
  const rows = Math.max(1, Math.ceil(n / DESKS_PER_ROW));

  const width = Math.max(MIN_ROOM.width, Math.ceil(BEDROOM_WIDTH + DESK_OFFSET + (cols - 1) * DESK_SPACING + 1.6));
  const depth = Math.max(
    MIN_ROOM.depth,
    Math.ceil(FIRST_BED_Z + Math.max(0, n - 1) * BED_SPACING + 1.2),
    Math.ceil(5.4 + (rows - 1) * DESK_ROW_SPACING),
  );
  const halfW = width / 2;
  const halfD = depth / 2;
  const partitionX = -halfW + BEDROOM_WIDTH;

  const beds: Slot[] = [];
  const nightstands: Slot[] = [];
  for (let i = 0; i < n; i++) {
    // Along the left wall, pillow towards the wall, foot end facing the doorway side.
    const bed: Slot = { id: `bed-${i + 1}`, x: -halfW + 1.15, z: -halfD + FIRST_BED_Z + i * BED_SPACING, rotationY: Math.PI / 2 };
    beds.push(bed);
    nightstands.push({ id: `nightstand-${i + 1}`, x: -halfW + 0.32, z: bed.z - 0.9, rotationY: Math.PI / 2 });
  }
  const bedMid = n > 0 ? (beds[0]!.z + beds[n - 1]!.z) / 2 : 0;
  const doorZ = Math.min(halfD - 1, Math.max(-halfD + 3.2, bedMid));

  const desks: Slot[] = [];
  const walkVia: Point[][] = [];
  // Walk out along the aisle in front of the row, down the corridor between
  // the rack and the desks, through the doorway, then to the foot of the bed.
  const corridorX = partitionX + 1;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / DESKS_PER_ROW);
    const col = i % DESKS_PER_ROW;
    const desk: Slot = {
      id: `desk-${i + 1}`,
      x: partitionX + DESK_OFFSET + col * DESK_SPACING,
      z: -halfD + 2.8 + row * DESK_ROW_SPACING,
      rotationY: 0,
    };
    desks.push(desk);
    const aisleZ = desk.z + DESK_FOOTPRINT.halfDepth + 0.6;
    walkVia.push([
      { x: desk.x + 0.62, z: aisleZ },
      { x: corridorX, z: aisleZ },
      { x: partitionX + 0.7, z: doorZ },
      { x: partitionX - 0.7, z: doorZ },
    ]);
  }

  return {
    room: { width, depth, wallHeight: 3, wallThickness: 0.2 },
    desks,
    beds,
    walkVia,
    serverRack: { id: 'rack', x: partitionX + 0.8, z: -halfD + 0.8, rotationY: Math.PI / 2 },
    decor: createDecor(desks, bedMid, halfW, halfD, cols),
    bedroom: {
      partitionX,
      doorZ,
      doorWidth: DOOR_WIDTH,
      nightstands,
      wardrobe: { id: 'wardrobe', x: -halfW + 0.75, z: -halfD + 0.3, rotationY: 0 },
    },
  };
}

/**
 * Windows between every other pair of desks in the first row (between the
 * monitors, not behind them), one above the beds, a shelf on the bedroom's
 * back wall next to the wardrobe, and a plant in the back-right corner.
 */
function createDecor(desks: Slot[], bedMid: number, halfW: number, halfD: number, cols: number): Decor {
  const windowAt = (id: string, wall: WallItem['wall'], at: number): WallItem => ({ id, wall, at, ...WINDOW });
  const windows: WallItem[] = [];
  const row0 = desks.slice(0, cols);
  for (let i = 0; i + 1 < row0.length; i += 2) {
    windows.push(windowAt(`window-back-${windows.length + 1}`, 'back', (row0[i]!.x + row0[i + 1]!.x) / 2));
  }
  if (row0.length === 1) windows.push(windowAt('window-back-1', 'back', row0[0]!.x + DESK_SPACING / 2));
  windows.push(windowAt('window-side-1', 'side', bedMid));

  return {
    windows,
    shelves: [{ id: 'shelf-1', wall: 'back', at: -halfW + 2.5, ...SHELF }],
    plants: [{ id: 'plant-1', x: halfW - 0.55, z: -halfD + 0.55, rotationY: 0 }],
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

  const plants = layout.decor?.plants ?? [];
  const bedroom = layout.bedroom;
  const bedroomSlots = bedroom ? [...bedroom.nightstands, bedroom.wardrobe] : [];
  const slots = [...layout.desks, ...layout.beds, layout.serverRack, ...plants, ...bedroomSlots];
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
    ...plants.map((p) => footprintBox(p, PLANT_FOOTPRINT.halfWidth, PLANT_FOOTPRINT.halfDepth)),
    ...(bedroom?.nightstands ?? []).map((s) => footprintBox(s, NIGHTSTAND_FOOTPRINT.halfWidth, NIGHTSTAND_FOOTPRINT.halfDepth)),
    ...(bedroom ? [footprintBox(bedroom.wardrobe, WARDROBE_FOOTPRINT.halfWidth, WARDROBE_FOOTPRINT.halfDepth)] : []),
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

  if (bedroom) errors.push(...validateBedroom(bedroom, boxes, halfW, halfD));
  errors.push(...validateWallItems(layout));
  return errors;
}

/** The partition must stand inside the room, leave its doorway open, and not cut through furniture. */
function validateBedroom(bedroom: Bedroom, boxes: Box[], halfW: number, halfD: number): string[] {
  const errors: string[] = [];
  const { partitionX, doorZ, doorWidth } = bedroom;
  if (!(Number.isFinite(partitionX) && Number.isFinite(doorZ) && doorWidth > 0)) {
    return ['bedroom partition has invalid dimensions'];
  }
  const half = PARTITION.thickness / 2;
  if (partitionX - half <= -halfW || partitionX + half >= halfW) errors.push('bedroom partition is outside the room');
  if (doorZ - doorWidth / 2 < -halfD || doorZ + doorWidth / 2 > halfD) errors.push('bedroom doorway is outside the room');
  for (const box of boxes) {
    if (box.minX < partitionX + half && box.maxX > partitionX - half) errors.push(`slot "${box.id}" crosses the partition`);
  }
  return errors;
}

/** Wall items must fit on their wall and not overlap each other. */
function validateWallItems(layout: OfficeLayout): string[] {
  const errors: string[] = [];
  const decor = layout.decor;
  if (!decor) return errors;
  const items = [...decor.windows, ...decor.shelves];
  const { room } = layout;
  for (const it of items) {
    const half = (it.wall === 'back' ? room.width : room.depth) / 2;
    if (!(Number.isFinite(it.at) && it.width > 0 && it.bottom >= 0 && it.top > it.bottom)) {
      errors.push(`wall item "${it.id}" has invalid dimensions`);
    } else if (it.at - it.width / 2 < -half || it.at + it.width / 2 > half || it.top > room.wallHeight) {
      errors.push(`wall item "${it.id}" does not fit on the ${it.wall} wall`);
    }
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const sideways = Math.abs(a.at - b.at) < (a.width + b.width) / 2;
      const vertical = a.bottom < b.top && b.bottom < a.top;
      if (a.wall === b.wall && sideways && vertical) errors.push(`wall items "${a.id}" and "${b.id}" overlap`);
    }
  }
  return errors;
}
