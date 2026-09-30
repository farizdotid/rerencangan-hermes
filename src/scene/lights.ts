import * as THREE from 'three';
import type { RoomSpec } from './layout';

/** Soft fill plus one shadow-casting sun. Only the sun casts shadows. */
export function createLights(room: RoomSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lights';

  group.add(new THREE.HemisphereLight(0xffffff, 0xdfe4ee, 1.5));

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(6, 12, 8);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;

  // Fit the shadow camera to the room so the 1024 map is not wasted.
  const half = Math.max(room.width, room.depth) / 2 + 1;
  const cam = sun.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 1;
  cam.far = 40;
  cam.updateProjectionMatrix();

  group.add(sun, sun.target);
  return group;
}
