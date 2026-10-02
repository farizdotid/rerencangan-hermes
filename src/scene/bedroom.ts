import * as THREE from 'three';
import { CARPET_TILE_SIZE, createCarpetTexture } from './floorTexture';
import { PARTITION, type Bedroom, type RoomSpec, type Slot } from './layout';
import { PALETTE } from './palette';
import { WAINSCOT_HEIGHT } from './wallDecor';

/** Just above the parquet, so the carpet never flickers through it. */
const CARPET_Y = 0.004;
/** Top of the chair rail; the bedroom paint starts here. */
const PAINT_BOTTOM = WAINSCOT_HEIGHT + 0.06;
const NIGHTSTAND_HEIGHT = 0.5;

export interface BedroomObjects {
  group: THREE.Group;
  /** Bedside lamps glow brighter at night (0 = day, 1 = night). */
  setNight(amount: number): void;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function placed(name: string, slot: Slot): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(slot.x, 0, slot.z);
  g.rotation.y = slot.rotationY;
  return g;
}

/** Wall-to-wall carpet over the bedroom floor. */
function createCarpet(bedroom: Bedroom, room: RoomSpec, anisotropy: number): THREE.Mesh {
  const left = -room.width / 2;
  const right = bedroom.partitionX - PARTITION.thickness / 2;
  const w = right - left;
  const map = createCarpetTexture(anisotropy);
  map?.repeat.set(w / CARPET_TILE_SIZE, room.depth / CARPET_TILE_SIZE);
  const mat = new THREE.MeshStandardMaterial({
    ...(map ? { map } : { color: PALETTE.carpet }),
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(w, room.depth), mat);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(left + w / 2, CARPET_Y, 0);
  carpet.receiveShadow = true;
  carpet.name = 'carpet';
  return carpet;
}

/** A calmer paint above the panelling on the bedroom's part of both walls. */
function createPaint(bedroom: Bedroom, room: RoomSpec): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bedroom-paint';
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.bedroomWall, roughness: 0.95 });
  const h = room.wallHeight - PAINT_BOTTOM;
  const y = PAINT_BOTTOM + h / 2;
  const left = -room.width / 2;
  const backW = bedroom.partitionX - left;

  const back = new THREE.Mesh(new THREE.PlaneGeometry(backW, h), mat);
  back.position.set(left + backW / 2, y, -room.depth / 2 + 0.003);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(room.depth, h), mat);
  side.rotation.y = Math.PI / 2;
  side.position.set(left + 0.003, y, 0);
  for (const m of [back, side]) {
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** Waist-high wooden wall along Z with an open doorway, posts on both sides. */
function createPartition(bedroom: Bedroom, room: RoomSpec): THREE.Group {
  const g = new THREE.Group();
  g.name = 'partition';
  const halfD = room.depth / 2;
  const { partitionX: x, doorZ, doorWidth } = bedroom;
  const t = PARTITION.thickness;
  const h = PARTITION.height;
  const body = new THREE.MeshStandardMaterial({ color: PALETTE.wainscot, roughness: 0.8 });
  const cap = new THREE.MeshStandardMaterial({ color: PALETTE.chairRail, roughness: 0.6 });

  const doorStart = doorZ - doorWidth / 2;
  const doorEnd = doorZ + doorWidth / 2;
  for (const [from, to] of [
    [-halfD, doorStart],
    [doorEnd, halfD],
  ] as const) {
    const len = to - from;
    if (len <= 0.01) continue;
    const mid = (from + to) / 2;
    g.add(mesh(new THREE.BoxGeometry(t, h, len), body, x, h / 2, mid));
    g.add(mesh(new THREE.BoxGeometry(t + 0.06, 0.06, len), cap, x, h + 0.03, mid));
  }
  const post = new THREE.BoxGeometry(t + 0.08, h + 0.25, 0.12);
  for (const z of [doorStart - 0.06, doorEnd + 0.06]) g.add(mesh(post, cap, x, (h + 0.25) / 2, z));
  return g;
}

interface Lamps {
  shade: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
}

/** Small bedside table with a drawer and a lamp; local +Z faces into the room. */
function createNightstand(slot: Slot, lamps: Lamps, wood: THREE.Material, knob: THREE.Material): THREE.Group {
  const g = placed(slot.id, slot);
  const h = NIGHTSTAND_HEIGHT;
  g.add(mesh(new THREE.BoxGeometry(0.42, h, 0.4), wood, 0, h / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.02, 0.01), knob, 0, h * 0.62, 0.205));
  g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), knob, 0, h * 0.48, 0.21));

  const base = new THREE.MeshStandardMaterial({ color: PALETTE.lampBase, roughness: 0.5 });
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 12), base, 0, h + 0.015, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), base, 0, h + 0.13, 0));
  const shade = mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.16, 16), lamps.shade, 0, h + 0.27, 0);
  shade.castShadow = false;
  g.add(shade);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), lamps.glow);
  glow.position.set(0, h + 0.27, 0);
  glow.renderOrder = 2;
  g.add(glow);
  return g;
}

/** Two-door wardrobe; local +Z faces into the room. */
function createWardrobe(slot: Slot, knob: THREE.Material): THREE.Group {
  const g = placed(slot.id, slot);
  const w = 1.2;
  const h = 1.9;
  const d = 0.55;
  const body = new THREE.MeshStandardMaterial({ color: PALETTE.wardrobe, roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: PALETTE.bedFrame, roughness: 0.7 });
  g.add(mesh(new THREE.BoxGeometry(w, h, d), body, 0, h / 2 + 0.06, 0));
  g.add(mesh(new THREE.BoxGeometry(w + 0.04, 0.06, d + 0.04), trim, 0, 0.03, 0));
  g.add(mesh(new THREE.BoxGeometry(w + 0.06, 0.05, d + 0.06), trim, 0, h + 0.085, 0));
  // Gap between the doors, and a knob on each.
  g.add(mesh(new THREE.BoxGeometry(0.015, h - 0.12, 0.01), trim, 0, h / 2 + 0.06, d / 2 + 0.003));
  const knobGeo = new THREE.SphereGeometry(0.03, 8, 6);
  for (const x of [-0.08, 0.08]) g.add(mesh(knobGeo, knob, x, h * 0.55, d / 2 + 0.02));
  return g;
}

/** Carpet, paint, partition, bedside tables with lamps, and a wardrobe. */
export function createBedroom(bedroom: Bedroom, room: RoomSpec, anisotropy = 1): BedroomObjects {
  const group = new THREE.Group();
  group.name = 'bedroom';
  group.add(createCarpet(bedroom, room, anisotropy));
  group.add(createPaint(bedroom, room));
  group.add(createPartition(bedroom, room));

  const lamps: Lamps = {
    shade: new THREE.MeshStandardMaterial({
      color: PALETTE.lampShade,
      emissive: PALETTE.lampGlow,
      emissiveIntensity: 0.3,
      roughness: 0.9,
    }),
    glow: new THREE.MeshBasicMaterial({
      color: PALETTE.lampGlow,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };
  const wood = new THREE.MeshStandardMaterial({ color: PALETTE.shelf, roughness: 0.7 });
  const knob = new THREE.MeshStandardMaterial({ color: PALETTE.knob, roughness: 0.5 });
  for (const slot of bedroom.nightstands) group.add(createNightstand(slot, lamps, wood, knob));
  group.add(createWardrobe(bedroom.wardrobe, knob));

  return {
    group,
    setNight(amount) {
      const night = Math.min(1, Math.max(0, amount));
      lamps.shade.emissiveIntensity = 0.3 + 0.7 * night;
      lamps.glow.opacity = 0.04 + 0.14 * night;
    },
  };
}
