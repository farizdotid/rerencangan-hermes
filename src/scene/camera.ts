import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fitOrthoFrustum } from './frustum';
import type { RoomSpec } from './layout';

/** Classic isometric angle: azimuth 45°, elevation atan(1/sqrt 2) ≈ 35.26°. */
const ISO_AZIMUTH = Math.PI / 4;
const ISO_POLAR = Math.PI / 2 - Math.atan(1 / Math.SQRT2);

/** How far the user may orbit away from the iso view. Keeps cutaway walls at the back. */
const AZIMUTH_RANGE = THREE.MathUtils.degToRad(35);
const POLAR_MIN = THREE.MathUtils.degToRad(35);
const POLAR_MAX = THREE.MathUtils.degToRad(65);
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 3;

/** Empty space around the room at zoom 1, as a fraction of its size. */
const MARGIN = 0.06;
const DISTANCE = 40;

/** World-space box enclosing the floor and both walls. */
export function roomBounds(room: RoomSpec): THREE.Box3 {
  const t = room.wallThickness;
  return new THREE.Box3(
    new THREE.Vector3(-room.width / 2 - t, 0, -room.depth / 2 - t),
    new THREE.Vector3(room.width / 2, room.wallHeight, room.depth / 2),
  );
}

/** Size of `box` on screen when seen from the iso angle (orthographic). */
function projectedSize(box: THREE.Box3): { width: number; height: number } {
  const center = box.getCenter(new THREE.Vector3());
  const eye = new THREE.Vector3().setFromSphericalCoords(1, ISO_POLAR, ISO_AZIMUTH).add(center);
  // lookAt yields a pure rotation (camera -> world); its transpose maps world -> camera.
  const toView = new THREE.Matrix4().lookAt(eye, center, THREE.Object3D.DEFAULT_UP).transpose();
  let halfW = 0;
  let halfH = 0;
  const p = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        // A box is centrally symmetric, so its projection is centered on `center`.
        p.set(x, y, z).sub(center).applyMatrix4(toView);
        halfW = Math.max(halfW, Math.abs(p.x));
        halfH = Math.max(halfH, Math.abs(p.y));
      }
    }
  }
  return { width: halfW * 2 * (1 + MARGIN), height: halfH * 2 * (1 + MARGIN) };
}

/** Orthographic isometric camera with constrained orbit controls, framed on the room. */
export class IsoView {
  readonly camera: THREE.OrthographicCamera;
  readonly controls: OrbitControls;
  private minWidth: number;
  private minHeight: number;
  private aspect: number;

  constructor(room: RoomSpec, aspect: number, dom: HTMLElement) {
    const box = roomBounds(room);
    const target = box.getCenter(new THREE.Vector3());
    const size = projectedSize(box);
    this.minWidth = size.width;
    this.minHeight = size.height;
    this.aspect = aspect;

    const f = fitOrthoFrustum(aspect, this.minHeight, this.minWidth);
    this.camera = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, 0.1, DISTANCE * 2);
    const offset = new THREE.Vector3().setFromSphericalCoords(DISTANCE, ISO_POLAR, ISO_AZIMUTH);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);

    const controls = new OrbitControls(this.camera, dom);
    controls.target.copy(target);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minAzimuthAngle = ISO_AZIMUTH - AZIMUTH_RANGE;
    controls.maxAzimuthAngle = ISO_AZIMUTH + AZIMUTH_RANGE;
    controls.minPolarAngle = POLAR_MIN;
    controls.maxPolarAngle = POLAR_MAX;
    controls.minZoom = ZOOM_MIN;
    controls.maxZoom = ZOOM_MAX;
    controls.update();
    this.controls = controls;
  }

  /** Re-frame for a room of a different size, keeping the user's rotation and zoom. */
  setRoom(room: RoomSpec): void {
    const box = roomBounds(room);
    const target = box.getCenter(new THREE.Vector3());
    const size = projectedSize(box);
    this.minWidth = size.width;
    this.minHeight = size.height;
    const shift = target.clone().sub(this.controls.target);
    this.camera.position.add(shift);
    this.controls.target.copy(target);
    this.resize(this.aspect);
    this.controls.update();
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    const f = fitOrthoFrustum(aspect, this.minHeight, this.minWidth);
    this.camera.left = f.left;
    this.camera.right = f.right;
    this.camera.top = f.top;
    this.camera.bottom = f.bottom;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
