import * as THREE from 'three';
import { createBed, createBedKit, type Bed } from './bed';
import { createDesk, createDeskKit, type Desk } from './desk';
import type { OfficeLayout, Point } from './layout';
import { createLights } from './lights';
import { createRoom } from './room';
import { ServerRack } from './serverRack';

export interface Office {
  root: THREE.Group;
  desks: Desk[];
  beds: Bed[];
  /** Per desk: waypoints for the walk to bed. */
  walkVia: Point[][];
  rack: ServerRack;
  update(timeSeconds: number): void;
  dispose(): void;
}

/** Build the whole static office from a layout. */
export function buildOffice(layout: OfficeLayout): Office {
  const root = new THREE.Group();
  root.name = 'office';

  root.add(createLights(layout.room));
  root.add(createRoom(layout.room));

  const kit = createDeskKit();
  const desks = layout.desks.map((slot) => createDesk(slot, kit));
  for (const desk of desks) root.add(desk.group);

  const bedKit = createBedKit();
  const beds = layout.beds.map((slot) => createBed(slot, bedKit));
  for (const bed of beds) root.add(bed.group);

  const rack = new ServerRack(layout.serverRack);
  root.add(rack.group);

  return {
    root,
    desks,
    beds,
    walkVia: layout.walkVia ?? [],
    rack,
    update(timeSeconds) {
      rack.update(timeSeconds);
    },
    dispose() {
      root.removeFromParent();
      disposeTree(root);
    },
  };
}

/** Dispose every geometry and material under `root` exactly once. */
export function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    if (obj instanceof THREE.Mesh) {
      geometries.add(obj.geometry);
      const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) materials.add(mat);
    }
    if (obj instanceof THREE.DirectionalLight) obj.shadow.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}
