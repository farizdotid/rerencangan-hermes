import { BED } from '../scene/bed';
import type { Slot } from '../scene/layout';

/** A position and facing in office space. Yaw 0 faces -Z. */
export interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Height of the avatar pivot while standing (feet touch the floor). */
export const WALK_Y = 0.12;

function place(slot: Slot, lx: number, lz: number, y: number, yaw: number): Placement {
  const c = Math.cos(slot.rotationY);
  const s = Math.sin(slot.rotationY);
  return { x: slot.x + lx * c + lz * s, y, z: slot.z - lx * s + lz * c, yaw };
}

export interface DeskPlaces {
  /** Sitting on the chair, facing the monitor. */
  seat: Placement;
  /** Standing beside the chair, where walks start and end. */
  standOut: Placement;
}

export function deskPlaces(slot: Slot, seat: { x: number; y: number; z: number }): DeskPlaces {
  return {
    seat: place(slot, seat.x, seat.z, seat.y, slot.rotationY),
    standOut: place(slot, seat.x + 0.62, seat.z + 0.12, WALK_Y, slot.rotationY),
  };
}

export interface BedPlaces {
  /** Standing at the foot end, facing the pillow. */
  approach: Placement;
  /** Lying on the back, head on the pillow. */
  lie: Placement;
}

export function bedPlaces(slot: Slot): BedPlaces {
  return {
    approach: place(slot, 0, BED.length / 2 + 0.4, WALK_Y, slot.rotationY),
    // Lying means leaning all the way back, so the avatar turns its back to the pillow first.
    lie: place(slot, 0, 0.18, BED.mattressTop + 0.2, slot.rotationY + Math.PI),
  };
}
