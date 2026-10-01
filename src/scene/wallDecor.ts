import * as THREE from 'three';
import { createRng } from '../data/demo';
import type { Decor, RoomSpec, Slot, WallItem } from './layout';
import { PALETTE } from './palette';
import { WAINSCOT_TILE, createDaySkyTexture, createNightSkyTexture, createWainscotTexture } from './wallTextures';

/** Height of the wooden panelling on the lower wall. */
export const WAINSCOT_HEIGHT = 0.95;
const PANEL_DEPTH = 0.04;

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

/** Wooden boards on the lower part of both walls, with a chair rail on top and a skirting board below. */
export function createWainscot(room: RoomSpec, anisotropy = 1): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wainscot';
  const halfW = room.width / 2;
  const halfD = room.depth / 2;

  const backTex = createWainscotTexture(anisotropy);
  const sideTex = backTex?.clone() ?? null;
  backTex?.repeat.set(room.width / WAINSCOT_TILE, 1);
  if (sideTex) {
    sideTex.repeat.set(room.depth / WAINSCOT_TILE, 1);
    sideTex.needsUpdate = true;
  }
  const panel = (map: THREE.Texture | null) =>
    map
      ? new THREE.MeshStandardMaterial({ map, roughness: 0.8 })
      : new THREE.MeshStandardMaterial({ color: PALETTE.wainscot, roughness: 0.8 });
  const rail = new THREE.MeshStandardMaterial({ color: PALETTE.chairRail, roughness: 0.6 });

  const h = WAINSCOT_HEIGHT;
  const back = mesh(new THREE.BoxGeometry(room.width, h, PANEL_DEPTH), panel(backTex), 0, h / 2, -halfD + PANEL_DEPTH / 2);
  const side = mesh(new THREE.BoxGeometry(PANEL_DEPTH, h, room.depth), panel(sideTex), -halfW + PANEL_DEPTH / 2, h / 2, 0);

  const railBack = mesh(new THREE.BoxGeometry(room.width, 0.06, 0.08), rail, 0, h + 0.03, -halfD + 0.04);
  const railSide = mesh(new THREE.BoxGeometry(0.08, 0.06, room.depth), rail, -halfW + 0.04, h + 0.03, 0);
  const skirtBack = mesh(new THREE.BoxGeometry(room.width, 0.1, 0.07), rail, 0, 0.05, -halfD + 0.035);
  const skirtSide = mesh(new THREE.BoxGeometry(0.07, 0.1, room.depth), rail, -halfW + 0.035, 0.05, 0);

  for (const m of [back, side, railBack, railSide, skirtBack, skirtSide]) {
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

/** Places a wall item's group on its wall, facing into the room (local +Z). */
function mountOnWall(group: THREE.Object3D, item: WallItem, room: RoomSpec): void {
  if (item.wall === 'back') {
    group.position.set(item.at, 0, -room.depth / 2);
  } else {
    group.position.set(-room.width / 2, 0, item.at);
    group.rotation.y = Math.PI / 2;
  }
}

export interface Windows {
  group: THREE.Group;
  /** Call now and then: fades the night sky in and out (0 = day, 1 = night). */
  setNight(amount: number): void;
}

function createWindows(items: readonly WallItem[], room: RoomSpec): Windows {
  const group = new THREE.Group();
  group.name = 'windows';

  const dayTex = createDaySkyTexture();
  const nightTex = createNightSkyTexture();
  const day = dayTex ? new THREE.MeshBasicMaterial({ map: dayTex }) : new THREE.MeshBasicMaterial({ color: 0xa9d2f5 });
  const night = nightTex
    ? new THREE.MeshBasicMaterial({ map: nightTex, transparent: true, opacity: 0, depthWrite: false })
    : new THREE.MeshBasicMaterial({ color: 0x18244a, transparent: true, opacity: 0, depthWrite: false });
  const frame = new THREE.MeshStandardMaterial({ color: PALETTE.windowFrame, roughness: 0.5 });
  const bar = 0.08;

  for (const item of items) {
    const w = item.width;
    const h = item.top - item.bottom;
    const cy = (item.bottom + item.top) / 2;
    const win = new THREE.Group();
    win.name = item.id;
    mountOnWall(win, item, room);

    const sky = new THREE.PlaneGeometry(w - bar, h - bar);
    win.add(mesh(sky, day, 0, cy, 0.012));
    const nightSky = mesh(sky, night, 0, cy, 0.016);
    nightSky.renderOrder = 1;
    win.add(nightSky);

    const horiz = new THREE.BoxGeometry(w, bar, bar);
    const vert = new THREE.BoxGeometry(bar, h, bar);
    win.add(mesh(horiz, frame, 0, item.top - bar / 2, bar / 2));
    win.add(mesh(horiz, frame, 0, item.bottom + bar / 2, bar / 2));
    win.add(mesh(vert, frame, -w / 2 + bar / 2, cy, bar / 2));
    win.add(mesh(vert, frame, w / 2 - bar / 2, cy, bar / 2));
    // Cross-shaped glazing bars.
    win.add(mesh(new THREE.BoxGeometry(0.04, h - bar, 0.05), frame, 0, cy, 0.04));
    win.add(mesh(new THREE.BoxGeometry(w - bar, 0.04, 0.05), frame, 0, cy, 0.04));
    const sill = mesh(new THREE.BoxGeometry(w + 0.2, 0.05, 0.18), frame, 0, item.bottom - 0.02, 0.09);
    sill.castShadow = true;
    win.add(sill);
    group.add(win);
  }

  return {
    group,
    setNight(amount) {
      night.opacity = Math.min(1, Math.max(0, amount));
      night.visible = night.opacity > 0.001;
    },
  };
}

interface PlantKit {
  leafGeo: THREE.IcosahedronGeometry;
  leaf: THREE.MeshStandardMaterial;
  leafDark: THREE.MeshStandardMaterial;
  pot: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
}

function createPlantKit(): PlantKit {
  return {
    leafGeo: new THREE.IcosahedronGeometry(1, 0),
    leaf: new THREE.MeshStandardMaterial({ color: PALETTE.leaf, roughness: 0.8, flatShading: true }),
    leafDark: new THREE.MeshStandardMaterial({ color: PALETTE.leafDark, roughness: 0.8, flatShading: true }),
    pot: new THREE.MeshStandardMaterial({ color: PALETTE.pot, roughness: 0.85 }),
    rim: new THREE.MeshStandardMaterial({ color: PALETTE.potRim, roughness: 0.85 }),
    soil: new THREE.MeshStandardMaterial({ color: PALETTE.soil, roughness: 1 }),
  };
}

/** A potted plant; `scale` 1 is a big floor plant about 1.5 units tall. */
function createPlant(kit: PlantKit, scale: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = createRng(seed);
  const potH = 0.45;
  const pot = mesh(new THREE.CylinderGeometry(0.26, 0.19, potH, 16), kit.pot, 0, potH / 2, 0);
  const rim = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), kit.rim, 0, potH - 0.02, 0);
  const soil = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 16), kit.soil, 0, potH - 0.01, 0);
  g.add(pot, rim, soil);
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + rng() * 0.5;
    const r = 0.12 + rng() * 0.2;
    const y = potH + 0.25 + rng() * 0.75;
    const leaf = mesh(kit.leafGeo, i % 3 === 0 ? kit.leafDark : kit.leaf, Math.cos(a) * r, y, Math.sin(a) * r);
    const s = 0.16 + rng() * 0.12;
    leaf.scale.set(s, s * (1.4 + rng() * 0.6), s);
    leaf.rotation.set(rng() * 0.6, a, rng() * 0.6);
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

function createShelf(item: WallItem, room: RoomSpec, kit: PlantKit): THREE.Group {
  const g = new THREE.Group();
  g.name = item.id;
  mountOnWall(g, item, room);
  const wood = new THREE.MeshStandardMaterial({ color: PALETTE.shelf, roughness: 0.7 });
  const y = item.bottom + 0.03;
  const board = mesh(new THREE.BoxGeometry(item.width, 0.05, 0.26), wood, 0, y, 0.13);
  board.castShadow = true;
  g.add(board);
  for (const x of [-item.width / 2 + 0.15, item.width / 2 - 0.15]) {
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.16, 0.18), wood, x, y - 0.1, 0.09));
  }
  // A few books, leaning slightly, and a small plant.
  const bookColors = [0x5b8def, 0xe57ea8, 0xf2c14e, 0x5cc8a8];
  bookColors.forEach((color, i) => {
    const hgt = 0.26 + (i % 2) * 0.05;
    const book = mesh(
      new THREE.BoxGeometry(0.07, hgt, 0.18),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
      -item.width / 2 + 0.18 + i * 0.08,
      y + 0.025 + hgt / 2,
      0.13,
    );
    if (i === bookColors.length - 1) book.rotation.z = -0.25;
    book.castShadow = true;
    g.add(book);
  });
  const plant = createPlant(kit, 0.35, 3);
  plant.position.set(item.width / 2 - 0.22, y + 0.025, 0.13);
  g.add(plant);
  return g;
}

export interface DecorObjects {
  group: THREE.Group;
  windows: Windows;
}

/** Windows, shelves, and floor plants from the layout. */
export function createDecor(decor: Decor, room: RoomSpec): DecorObjects {
  const group = new THREE.Group();
  group.name = 'decor';
  const windows = createWindows(decor.windows, room);
  group.add(windows.group);
  const kit = createPlantKit();
  for (const shelf of decor.shelves) group.add(createShelf(shelf, room, kit));
  decor.plants.forEach((slot: Slot, i) => {
    const plant = createPlant(kit, 1, 11 + i);
    plant.name = slot.id;
    plant.position.set(slot.x, 0, slot.z);
    plant.rotation.y = slot.rotationY;
    group.add(plant);
  });
  return { group, windows };
}
