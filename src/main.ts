import * as THREE from 'three';
import { IsoView } from './scene/camera';
import { DEFAULT_LAYOUT, validateLayout } from './scene/layout';
import { buildOffice } from './scene/office';
import { PALETTE } from './scene/palette';
import { clampPixelRatio } from './scene/pixelRatio';
import { FpsMeter } from './ui/fpsMeter';
import './style.css';

const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

const layoutErrors = validateLayout(DEFAULT_LAYOUT);
if (layoutErrors.length > 0) throw new Error(`Invalid office layout: ${layoutErrors.join('; ')}`);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.background);

const view = new IsoView(DEFAULT_LAYOUT.room, container.clientWidth / container.clientHeight, renderer.domElement);

const office = buildOffice(DEFAULT_LAYOUT);
scene.add(office.root);

const fps = import.meta.env.DEV ? new FpsMeter(container) : null;
const timer = new THREE.Timer();

function frame(time: number): void {
  timer.update(time);
  view.update();
  office.update(timer.getElapsed());
  renderer.render(scene, view.camera);
  fps?.tick();
}

function onResize(): void {
  if (!container) return;
  const { clientWidth: w, clientHeight: h } = container;
  view.resize(w / h);
  renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
  renderer.setSize(w, h);
}

// Stop rendering while the tab is hidden (PRD section 8: performance).
function onVisibilityChange(): void {
  if (document.hidden) {
    renderer.setAnimationLoop(null);
  } else {
    fps?.reset();
    renderer.setAnimationLoop(frame);
  }
}

window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', onVisibilityChange);
renderer.setAnimationLoop(frame);

// Clean up GPU resources when Vite hot-reloads this module.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    view.dispose();
    office.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    container.querySelector('.fps-meter')?.remove();
  });
}
