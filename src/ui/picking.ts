import * as THREE from 'three';

/** Max pointer travel (px) and duration (ms) for a press to count as a click, not a camera drag. */
export const CLICK_MAX_MOVE_PX = 5;
export const CLICK_MAX_MS = 700;

export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

export function isClick(down: PointerSample, up: PointerSample): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_MAX_MOVE_PX && up.t - down.t <= CLICK_MAX_MS;
}

export interface PickingOptions {
  dom: HTMLElement;
  camera: THREE.Camera;
  targets: () => THREE.Object3D[];
  resolve: (hit: THREE.Object3D) => string | null;
  /** id of the clicked agent, or null for a click on empty space. */
  onPick: (id: string | null) => void;
}

/** Click-to-select for avatars, with a pointer cursor on hover. Returns a cleanup function. */
export function installPicking(opts: PickingOptions): () => void {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: PointerSample | null = null;

  const pick = (e: PointerEvent): string | null => {
    const rect = opts.dom.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, opts.camera);
    for (const hit of raycaster.intersectObjects(opts.targets(), true)) {
      if (!hit.object.visible) continue;
      const id = opts.resolve(hit.object);
      if (id) return id;
    }
    return null;
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent): void => {
    if (e.button !== 0 || !down) return;
    const start = down;
    down = null;
    if (isClick(start, { x: e.clientX, y: e.clientY, t: performance.now() })) opts.onPick(pick(e));
  };
  const onMove = (e: PointerEvent): void => {
    if (e.buttons !== 0 || e.pointerType !== 'mouse') return;
    opts.dom.style.cursor = pick(e) ? 'pointer' : '';
  };

  opts.dom.addEventListener('pointerdown', onDown);
  opts.dom.addEventListener('pointerup', onUp);
  opts.dom.addEventListener('pointermove', onMove);
  return () => {
    opts.dom.removeEventListener('pointerdown', onDown);
    opts.dom.removeEventListener('pointerup', onUp);
    opts.dom.removeEventListener('pointermove', onMove);
    opts.dom.style.cursor = '';
  };
}
