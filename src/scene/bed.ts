import * as THREE from 'three';
import type { Slot } from './layout';
import { PALETTE } from './palette';

/** Bed dimensions (local space: length along Z, pillow at -Z, foot end at +Z). */
export const BED = {
  width: 1.1,
  length: 2.1,
  /** Height of the mattress top above the floor. */
  mattressTop: 0.45,
  pillowZ: -0.72,
} as const;

export interface Bed {
  slot: Slot;
  group: THREE.Group;
}

export interface BedKit {
  frame: THREE.BoxGeometry;
  mattress: THREE.BoxGeometry;
  pillow: THREE.BoxGeometry;
  blanket: THREE.BoxGeometry;
  headboard: THREE.BoxGeometry;
  wood: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  pillowMat: THREE.MeshStandardMaterial;
  blanketMat: THREE.MeshStandardMaterial;
}

export function createBedKit(): BedKit {
  return {
    frame: new THREE.BoxGeometry(BED.width, 0.28, BED.length),
    mattress: new THREE.BoxGeometry(BED.width - 0.1, 0.17, BED.length - 0.1),
    pillow: new THREE.BoxGeometry(0.7, 0.1, 0.34),
    blanket: new THREE.BoxGeometry(BED.width - 0.06, 0.07, 0.75),
    headboard: new THREE.BoxGeometry(BED.width, 0.7, 0.08),
    wood: new THREE.MeshStandardMaterial({ color: PALETTE.bedFrame, roughness: 0.75 }),
    cloth: new THREE.MeshStandardMaterial({ color: PALETTE.mattress, roughness: 0.95 }),
    pillowMat: new THREE.MeshStandardMaterial({ color: PALETTE.pillow, roughness: 0.9 }),
    blanketMat: new THREE.MeshStandardMaterial({ color: PALETTE.blanket, roughness: 0.9 }),
  };
}

function part(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A single bed with pillow and a blanket folded at the foot end. */
export function createBed(slot: Slot, kit: BedKit): Bed {
  const group = new THREE.Group();
  group.name = `bed:${slot.id}`;
  group.position.set(slot.x, 0, slot.z);
  group.rotation.y = slot.rotationY;

  group.add(part(kit.frame, kit.wood, 0, 0.14, 0));
  group.add(part(kit.headboard, kit.wood, 0, 0.35, -BED.length / 2 + 0.04));
  group.add(part(kit.mattress, kit.cloth, 0, BED.mattressTop - 0.085, 0));
  group.add(part(kit.pillow, kit.pillowMat, 0, BED.mattressTop + 0.05, BED.pillowZ));
  group.add(part(kit.blanket, kit.blanketMat, 0, BED.mattressTop + 0.035, BED.length / 2 - 0.45));
  return { slot, group };
}
