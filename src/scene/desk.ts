import * as THREE from 'three';
import type { Slot } from './layout';
import { PALETTE } from './palette';

/**
 * Geometries and materials shared by every desk. Built once per office and
 * disposed together with it.
 */
export interface DeskKit {
  top: THREE.BoxGeometry;
  leg: THREE.BoxGeometry;
  monitorBody: THREE.BoxGeometry;
  monitorStand: THREE.BoxGeometry;
  monitorBase: THREE.BoxGeometry;
  screen: THREE.PlaneGeometry;
  keyboard: THREE.BoxGeometry;
  seat: THREE.BoxGeometry;
  backrest: THREE.BoxGeometry;
  pole: THREE.CylinderGeometry;
  chairFoot: THREE.CylinderGeometry;
  wood: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  monitor: THREE.MeshStandardMaterial;
  keys: THREE.MeshStandardMaterial;
  chair: THREE.MeshStandardMaterial;
  chairBase: THREE.MeshStandardMaterial;
}

export function createDeskKit(): DeskKit {
  return {
    top: new THREE.BoxGeometry(1.8, 0.08, 0.9),
    leg: new THREE.BoxGeometry(0.06, 0.71, 0.06),
    monitorBody: new THREE.BoxGeometry(0.9, 0.55, 0.05),
    monitorStand: new THREE.BoxGeometry(0.08, 0.2, 0.06),
    monitorBase: new THREE.BoxGeometry(0.32, 0.02, 0.2),
    screen: new THREE.PlaneGeometry(0.82, 0.47),
    keyboard: new THREE.BoxGeometry(0.5, 0.025, 0.16),
    seat: new THREE.BoxGeometry(0.55, 0.08, 0.5),
    backrest: new THREE.BoxGeometry(0.55, 0.5, 0.07),
    pole: new THREE.CylinderGeometry(0.035, 0.035, 0.4, 10),
    chairFoot: new THREE.CylinderGeometry(0.28, 0.3, 0.05, 16),
    wood: new THREE.MeshStandardMaterial({ color: PALETTE.deskTop, roughness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ color: PALETTE.deskLeg, roughness: 0.5, metalness: 0.3 }),
    monitor: new THREE.MeshStandardMaterial({ color: PALETTE.monitorBody, roughness: 0.5 }),
    keys: new THREE.MeshStandardMaterial({ color: 0xe6e9ef, roughness: 0.6 }),
    chair: new THREE.MeshStandardMaterial({ color: PALETTE.chairSeat, roughness: 0.8 }),
    chairBase: new THREE.MeshStandardMaterial({ color: PALETTE.chairBase, roughness: 0.6 }),
  };
}

export interface Desk {
  slot: Slot;
  group: THREE.Group;
  /** Per-desk screen material, so each monitor can light up on its own. */
  screen: THREE.MeshStandardMaterial;
  /** Where an avatar sits, in the desk group's local space. */
  seatPosition: THREE.Vector3;
}

const DESK_HEIGHT = 0.75;
const DESK_Z = -0.3; // desk surface sits behind the slot center
const CHAIR_Z = 0.55; // chair sits in front, on the camera side

function part(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A desk with monitor, keyboard and chair. Monitor faces +Z locally. */
export function createDesk(slot: Slot, kit: DeskKit): Desk {
  const group = new THREE.Group();
  group.name = `desk:${slot.id}`;
  group.position.set(slot.x, 0, slot.z);
  group.rotation.y = slot.rotationY;

  const topY = DESK_HEIGHT - 0.04;
  group.add(part(kit.top, kit.wood, 0, topY, DESK_Z));
  const legY = (DESK_HEIGHT - 0.08) / 2;
  for (const lx of [-0.84, 0.84]) {
    for (const lz of [DESK_Z - 0.39, DESK_Z + 0.39]) {
      group.add(part(kit.leg, kit.metal, lx, legY, lz));
    }
  }

  const surface = DESK_HEIGHT;
  const monitorZ = DESK_Z - 0.22;
  group.add(part(kit.monitorBase, kit.monitor, 0, surface + 0.01, monitorZ));
  group.add(part(kit.monitorStand, kit.monitor, 0, surface + 0.12, monitorZ - 0.02));
  const monitorY = surface + 0.47;
  group.add(part(kit.monitorBody, kit.monitor, 0, monitorY, monitorZ));

  const screen = new THREE.MeshStandardMaterial({
    color: PALETTE.screenOff,
    emissive: 0x000000,
    roughness: 0.3,
  });
  const screenMesh = new THREE.Mesh(kit.screen, screen);
  screenMesh.position.set(0, monitorY, monitorZ + 0.026);
  screenMesh.name = 'screen';
  group.add(screenMesh);

  group.add(part(kit.keyboard, kit.keys, 0, surface + 0.0125, DESK_Z + 0.2));

  // Chair: seat faces the desk (-Z), backrest on the camera side.
  group.add(part(kit.chairFoot, kit.chairBase, 0, 0.025, CHAIR_Z));
  group.add(part(kit.pole, kit.chairBase, 0, 0.25, CHAIR_Z));
  group.add(part(kit.seat, kit.chair, 0, 0.49, CHAIR_Z));
  group.add(part(kit.backrest, kit.chair, 0, 0.8, CHAIR_Z + 0.24));

  return { slot, group, screen, seatPosition: new THREE.Vector3(0, 0.53, CHAIR_Z) };
}
