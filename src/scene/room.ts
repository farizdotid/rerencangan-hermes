import * as THREE from 'three';
import type { RoomSpec } from './layout';
import { PALETTE } from './palette';

const FLOOR_THICKNESS = 0.2;
const TRIM_HEIGHT = 0.12;

/** Floor plus two cutaway walls on the back edges (min X and min Z). */
export function createRoom(room: RoomSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = 'room';

  const halfW = room.width / 2;
  const halfD = room.depth / 2;
  const t = room.wallThickness;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(room.width, FLOOR_THICKNESS, room.depth),
    new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.9 }),
  );
  floor.position.y = -FLOOR_THICKNESS / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.wallTrim, roughness: 0.8 });

  // Walls start at the bottom of the floor slab so no gap shows at the base.
  const wallTotal = room.wallHeight + FLOOR_THICKNESS;
  const wallY = wallTotal / 2 - FLOOR_THICKNESS;
  const trimY = room.wallHeight + TRIM_HEIGHT / 2;

  // Back wall runs along X and also covers the corner so the walls meet cleanly.
  const backLength = room.width + t;
  const back = new THREE.Mesh(new THREE.BoxGeometry(backLength, wallTotal, t), wallMat);
  back.position.set(-t / 2, wallY, -halfD - t / 2);
  back.receiveShadow = true;
  back.name = 'wall-back';

  const side = new THREE.Mesh(new THREE.BoxGeometry(t, wallTotal, room.depth), wallMat);
  side.position.set(-halfW - t / 2, wallY, 0);
  side.receiveShadow = true;
  side.name = 'wall-side';

  const backTrim = new THREE.Mesh(new THREE.BoxGeometry(backLength, TRIM_HEIGHT, t + 0.02), trimMat);
  backTrim.position.set(back.position.x, trimY, back.position.z);
  const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(t + 0.02, TRIM_HEIGHT, room.depth), trimMat);
  sideTrim.position.set(side.position.x, trimY, 0);

  group.add(back, side, backTrim, sideTrim);
  return group;
}
