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

export interface OfficeLayout {
  room: RoomSpec;
  desks: Slot[];
  serverRack: Slot;
}

/** Footprint half-sizes used for bounds and overlap checks. */
export const DESK_FOOTPRINT = { halfWidth: 1.0, halfDepth: 1.1 } as const;
export const RACK_FOOTPRINT = { halfWidth: 0.45, halfDepth: 0.4 } as const;

export const DEFAULT_LAYOUT: OfficeLayout = {
  room: { width: 14, depth: 10, wallHeight: 3, wallThickness: 0.2 },
  desks: [
    { id: 'desk-1', x: -2.5, z: -2.2, rotationY: 0 },
    { id: 'desk-2', x: 0.8, z: -2.2, rotationY: 0 },
    { id: 'desk-3', x: 4.1, z: -2.2, rotationY: 0 },
  ],
  serverRack: { id: 'rack', x: -6.2, z: -4.2, rotationY: Math.PI / 2 },
};

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

  const slots = [...layout.desks, layout.serverRack];
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
