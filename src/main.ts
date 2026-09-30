import * as THREE from 'three';
import { Crew } from './avatar/Crew';
import { DEMO_AGENTS, DemoGenerator } from './data/demo';
import type { AgentState } from './data/types';
import { IsoView } from './scene/camera';
import { DEFAULT_LAYOUT, validateLayout } from './scene/layout';
import { buildOffice } from './scene/office';
import { PALETTE } from './scene/palette';
import { clampPixelRatio } from './scene/pixelRatio';
import { installDevControls, type DevCommand } from './ui/devControls';
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

const crew = new Crew(DEMO_AGENTS, office.desks);
const demo = new DemoGenerator(crew.ids, 0);

/** State forced from the dev keyboard; null means demo data drives the avatars. */
let forced: AgentState | null = null;

function onDevCommand(cmd: DevCommand): void {
  if (cmd.kind === 'force') {
    forced = cmd.state;
    crew.setAll(cmd.state);
  } else {
    forced = null;
    for (const { id, state } of demo.snapshot()) crew.setState(id, state);
  }
}

const fps = import.meta.env.DEV ? new FpsMeter(container) : null;
const removeDevControls = import.meta.env.DEV ? installDevControls(container, onDevCommand) : null;
const timer = new THREE.Timer();

/** Longest step fed to animations, so a stalled frame does not skip transitions. */
const MAX_DT = 0.1;

function frame(time: number): void {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), MAX_DT);
  const t = timer.getElapsed();

  const changes = demo.tick(t);
  if (forced === null) {
    for (const { id, state } of changes) crew.setState(id, state);
  }

  view.update();
  office.update(t);
  crew.update(dt, t);
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

// Debug handle for dev tooling (inspecting renderer.info); not in production builds.
if (import.meta.env.DEV) {
  Object.assign(window, { __rerencangan: { renderer, crew } });
}

// Clean up GPU resources when Vite hot-reloads this module.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    removeDevControls?.();
    view.dispose();
    crew.dispose();
    office.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    container.querySelector('.fps-meter')?.remove();
  });
}
