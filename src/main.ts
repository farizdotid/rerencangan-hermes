import * as THREE from 'three';
import { Crew } from './avatar/Crew';
import { StatusClient, type ConnectionStatus } from './data/client';
import { displayStates, rosterKey } from './data/present';
import type { AgentState, Snapshot } from './data/types';
import { IsoView } from './scene/camera';
import { DEFAULT_LAYOUT, validateLayout } from './scene/layout';
import { buildOffice } from './scene/office';
import { PALETTE } from './scene/palette';
import { clampPixelRatio } from './scene/pixelRatio';
import { AgentPanel } from './ui/agentPanel';
import { ConnectionIndicator } from './ui/connectionIndicator';
import { describeAgent } from './ui/describe';
import { installDevControls, type DevCommand } from './ui/devControls';
import { FpsMeter } from './ui/fpsMeter';
import { Hud } from './ui/hud';
import { installPicking } from './ui/picking';
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

/** How long the server may be unreachable before avatars stop trusting the last snapshot. */
const DISCONNECT_GRACE_MS = 10_000;

/** Rack LED colors: healthy gateway, stopped gateway, and no fresh data. */
const LED_OK = PALETTE.ledOk;
const LED_DOWN = PALETTE.ledError;
const LED_UNKNOWN = 0xf0b429;

let crew: Crew | null = null;
let roster = '';
let latest: Snapshot | null = null;
let receivedAt: number | null = null;
let stale = false;
let staleTimer: ReturnType<typeof setTimeout> | null = null;
let selectedId: string | null = null;
/** State forced from the dev keyboard; null means server data drives the avatars. */
let forced: AgentState | null = null;

const hud = new Hud(container);
const indicator = new ConnectionIndicator(hud.root);
hud.mount();
const panel = new AgentPanel(container, () => select(null));

/** Updates HUD, rack LEDs, and the info panel from the latest data. */
function refreshUi(): void {
  const now = Date.now();
  const shown = latest ? displayStates(latest, { stale }) : [];
  hud.set({ snapshot: latest, shown, stale, receivedAt });

  const running = latest?.gateway.running ?? false;
  office.rack.setLedColor(!latest || stale ? LED_UNKNOWN : running ? LED_OK : LED_DOWN);

  const agent = selectedId ? latest?.agents.find((a) => a.id === selectedId) : undefined;
  if (!agent) {
    if (selectedId) select(null);
    return;
  }
  const shownState = shown.find((s) => s.id === agent.id)?.state ?? agent.state;
  panel.show(describeAgent(agent, { shownState, gatewayRunning: running, stale, now }));
}

function select(id: string | null): void {
  selectedId = id && crew?.has(id) ? id : null;
  crew?.setSelected(selectedId);
  if (selectedId) refreshUi();
  else panel.hide();
}

function syncStates(): void {
  if (crew && latest && !forced) {
    for (const { id, state } of displayStates(latest, { stale })) crew.setState(id, state);
  }
  refreshUi();
}

function onSnapshot(snapshot: Snapshot): void {
  latest = snapshot;
  receivedAt = Date.now();
  const key = rosterKey(snapshot.agents);
  if (key !== roster) {
    crew?.dispose();
    crew = new Crew(snapshot.agents, office.desks);
    roster = key;
    if (forced) crew.setAll(forced);
    crew.setSelected(selectedId);
  }
  syncStates();
}

function onStatus(status: ConnectionStatus): void {
  indicator.set(status);
  if (status === 'connected') {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = null;
    stale = false;
    syncStates();
  } else if (!staleTimer && !stale) {
    staleTimer = setTimeout(() => {
      staleTimer = null;
      stale = true;
      syncStates();
    }, DISCONNECT_GRACE_MS);
  }
}

const client = new StatusClient({ onSnapshot, onStatus });
client.start();

const removePicking = installPicking({
  dom: renderer.domElement,
  camera: view.camera,
  targets: () => crew?.pickTargets() ?? [],
  resolve: (hit) => crew?.idFromObject(hit) ?? null,
  onPick: (id) => select(id),
});

// Relative times ("5 dtk lalu") move on even when no new data arrives.
const clockTimer = setInterval(() => {
  if (!document.hidden) refreshUi();
}, 1000);

function onDevCommand(cmd: DevCommand): void {
  if (cmd.kind === 'force') {
    forced = cmd.state;
    crew?.setAll(cmd.state);
  } else {
    forced = null;
    syncStates();
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

  view.update();
  office.update(t);
  crew?.update(dt, t);
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
  Object.assign(window, {
    __rerencangan: {
      renderer,
      camera: view.camera,
      get crew() {
        return crew;
      },
    },
  });
}

// Clean up GPU resources when Vite hot-reloads this module.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    removeDevControls?.();
    removePicking();
    clearInterval(clockTimer);
    client.stop();
    if (staleTimer) clearTimeout(staleTimer);
    indicator.dispose();
    hud.dispose();
    panel.dispose();
    view.dispose();
    crew?.dispose();
    office.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    container.querySelector('.fps-meter')?.remove();
  });
}
