import * as THREE from 'three';
import { createRng } from '../data/demo';
import { PALETTE } from './palette';

/** World units covered by one repeat of the floor texture. */
export const FLOOR_TILE_SIZE = 4;

export interface Plank {
  /** Start along the row, in world units; may run past the tile edge and wrap. */
  x: number;
  length: number;
  /** Brightness variation, -1 (darker) to 1 (lighter). */
  shade: number;
}

export interface ParquetOptions {
  /** Tile width and height in world units. */
  size: number;
  rows: number;
  minLength: number;
  maxLength: number;
  /** Seams in neighbouring rows stay at least this far apart (world units). */
  minSeamGap: number;
}

export const PARQUET: ParquetOptions = { size: FLOOR_TILE_SIZE, rows: 8, minLength: 1.1, maxLength: 2.6, minSeamGap: 0.3 };

function seamsOf(row: readonly Plank[], size: number): number[] {
  return row.map((p) => ((p.x % size) + size) % size);
}

function seamDistance(a: number[], b: number[], size: number): number {
  let best = Infinity;
  for (const x of a) {
    for (const y of b) {
      const d = Math.abs(x - y);
      best = Math.min(best, d, size - d);
    }
  }
  return best;
}

/**
 * Plank layout for one seamless tile: each row is filled exactly (so the tile
 * wraps left to right) and starts at a random offset, picked so its seams do
 * not line up with the row above.
 */
export function parquetLayout(rng: () => number, opts: ParquetOptions = PARQUET): Plank[][] {
  const { size, rows, minLength, maxLength } = opts;
  const layout: Plank[][] = [];
  for (let r = 0; r < rows; r++) {
    const lengths: number[] = [];
    let remaining = size;
    while (remaining > maxLength) {
      let len = minLength + rng() * (maxLength - minLength);
      if (remaining - len < minLength) len = remaining - minLength;
      lengths.push(len);
      remaining -= len;
    }
    lengths.push(remaining);
    const shades = lengths.map(() => rng() * 2 - 1);

    // Try a few offsets and keep the one whose seams sit farthest from the previous row
    // (and, for the last row, from the first one, because the tile wraps vertically too).
    const neighbours = [layout[r - 1], r === rows - 1 ? layout[0] : undefined].filter((n): n is Plank[] => !!n);
    let bestRow: Plank[] = [];
    let bestGap = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      let x = rng() * size;
      const row = lengths.map((length, i) => {
        const plank = { x, length, shade: shades[i]! };
        x += length;
        return plank;
      });
      const gap = Math.min(Infinity, ...neighbours.map((n) => seamDistance(seamsOf(row, size), seamsOf(n, size), size)));
      if (gap > bestGap) {
        bestGap = gap;
        bestRow = row;
      }
      if (gap >= opts.minSeamGap) break;
    }
    layout.push(bestRow);
  }
  return layout;
}

function shadeColor(base: THREE.Color, shade: number): string {
  const c = base.clone();
  if (shade >= 0) c.lerp(new THREE.Color(0xffffff), 0.06 * shade);
  else c.lerp(new THREE.Color(0x000000), -0.07 * shade);
  return `#${c.getHexString()}`;
}

/**
 * Seamless wooden parquet drawn on a canvas, so no image files are shipped.
 * Returns null where there is no DOM canvas (for example in unit tests).
 */
export function createFloorTexture(anisotropy = 1): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const px = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const rng = createRng(20261001);
  const opts = PARQUET;
  const scale = px / opts.size;
  const rowH = px / opts.rows;
  const wood = new THREE.Color(PALETTE.floorWood);
  const seam = `#${new THREE.Color(PALETTE.floorSeam).getHexString()}`;

  parquetLayout(rng, opts).forEach((row, r) => {
    const y = r * rowH;
    for (const plank of row) {
      const x = plank.x * scale;
      const w = plank.length * scale;
      // Draw twice when a plank runs off the right edge, so the tile wraps.
      for (const dx of x + w > px ? [0, -px] : [0]) {
        ctx.fillStyle = shadeColor(wood, plank.shade);
        ctx.fillRect(x + dx, y, w, rowH);

        // A few soft grain lines along the plank.
        ctx.strokeStyle = 'rgba(90, 60, 30, 0.07)';
        ctx.lineWidth = 2;
        for (let g = 0; g < 4; g++) {
          const gy = y + rowH * (0.18 + 0.2 * g) + (rng() - 0.5) * 8;
          ctx.beginPath();
          ctx.moveTo(x + dx, gy);
          ctx.bezierCurveTo(x + dx + w * 0.3, gy + (rng() - 0.5) * 10, x + dx + w * 0.7, gy + (rng() - 0.5) * 10, x + dx + w, gy);
          ctx.stroke();
        }

        // Butt joint at the start of the plank.
        ctx.fillStyle = seam;
        ctx.fillRect(x + dx, y, 3, rowH);
      }
    }
    // Long seam between rows.
    ctx.fillStyle = seam;
    ctx.fillRect(0, y, px, 3);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

/** World units covered by one repeat of the carpet texture. */
export const CARPET_TILE_SIZE = 2;

/** Soft, low-pile carpet: a warm base with fine flecks. Null without a DOM. */
export function createCarpetTexture(anisotropy = 1): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = `#${new THREE.Color(PALETTE.carpet).getHexString()}`;
  ctx.fillRect(0, 0, c.width, c.height);
  const rng = createRng(5);
  const fleck = new THREE.Color(PALETTE.carpetFleck).getHexString();
  for (let i = 0; i < 2600; i++) {
    ctx.globalAlpha = 0.25 + rng() * 0.35;
    ctx.fillStyle = rng() < 0.7 ? `#${fleck}` : '#ffffff';
    ctx.fillRect(Math.floor(rng() * c.width), Math.floor(rng() * c.height), 1 + Math.floor(rng() * 2), 1);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}
