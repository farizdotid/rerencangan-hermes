import * as THREE from 'three';
import { createRng } from '../data/demo';
import { PALETTE } from './palette';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

function finish(c: HTMLCanvasElement, repeat: boolean, anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** World units of wall covered by one horizontal repeat of the wainscot texture. */
export const WAINSCOT_TILE = 2;

/** Vertical tongue-and-groove boards for the lower wall. Null without a DOM. */
export function createWainscotTexture(anisotropy = 1): THREE.CanvasTexture | null {
  const made = canvas(512, 256);
  if (!made) return null;
  const [c, ctx] = made;
  const rng = createRng(7);
  const boards = 8;
  const bw = c.width / boards;
  const base = new THREE.Color(PALETTE.wainscot);
  for (let i = 0; i < boards; i++) {
    const shade = base.clone().lerp(new THREE.Color(rng() < 0.5 ? 0xffffff : 0x000000), 0.04 * rng());
    ctx.fillStyle = `#${shade.getHexString()}`;
    ctx.fillRect(i * bw, 0, bw, c.height);
    // Groove on the left edge of each board, with a soft highlight next to it.
    ctx.fillStyle = `#${new THREE.Color(PALETTE.wainscotGroove).getHexString()}`;
    ctx.fillRect(i * bw, 0, 4, c.height);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(i * bw + 4, 0, 3, c.height);
  }
  return finish(c, true, anisotropy);
}

/** Clear sky with a few soft clouds. Null without a DOM. */
export function createDaySkyTexture(): THREE.CanvasTexture | null {
  const made = canvas(256, 256);
  if (!made) return null;
  const [c, ctx] = made;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#7fb8f0');
  g.addColorStop(1, '#d7ecff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, r] of [
    [60, 80, 22],
    [85, 72, 28],
    [112, 82, 20],
    [175, 150, 18],
    [198, 142, 24],
    [222, 152, 16],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, false, 1);
}

/** Dark sky with stars and a crescent moon. Null without a DOM. */
export function createNightSkyTexture(): THREE.CanvasTexture | null {
  const made = canvas(256, 256);
  if (!made) return null;
  const [c, ctx] = made;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#0d1633');
  g.addColorStop(1, '#2b3b70');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const rng = createRng(42);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,240,${0.4 + rng() * 0.6})`;
    ctx.fillRect(rng() * c.width, rng() * c.height * 0.85, rng() < 0.15 ? 3 : 2, rng() < 0.15 ? 3 : 2);
  }
  // Crescent: a pale disc with a sky-coloured disc over it.
  ctx.fillStyle = '#f4f1d0';
  ctx.beginPath();
  ctx.arc(190, 60, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#142050';
  ctx.beginPath();
  ctx.arc(202, 52, 22, 0, Math.PI * 2);
  ctx.fill();
  return finish(c, false, 1);
}
