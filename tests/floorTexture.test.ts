import { describe, expect, it } from 'vitest';
import { createRng } from '../src/data/demo';
import { PARQUET, createFloorTexture, parquetLayout } from '../src/scene/floorTexture';

const seams = (row: { x: number }[], size: number) => row.map((p) => ((p.x % size) + size) % size);

function nearestSeam(a: number[], b: number[], size: number): number {
  let best = Infinity;
  for (const x of a) for (const y of b) best = Math.min(best, Math.abs(x - y), size - Math.abs(x - y));
  return best;
}

describe('parquetLayout', () => {
  const layout = parquetLayout(createRng(20261001));

  it('fills every row exactly, so the tile repeats without gaps', () => {
    expect(layout).toHaveLength(PARQUET.rows);
    for (const row of layout) {
      expect(row.reduce((s, p) => s + p.length, 0)).toBeCloseTo(PARQUET.size, 9);
      // Planks are contiguous.
      for (let i = 1; i < row.length; i++) expect(row[i]!.x).toBeCloseTo(row[i - 1]!.x + row[i - 1]!.length, 9);
    }
  });

  it('keeps plank lengths within bounds and shades within [-1, 1]', () => {
    for (const p of layout.flat()) {
      expect(p.length).toBeGreaterThanOrEqual(PARQUET.minLength - 1e-9);
      expect(p.length).toBeLessThanOrEqual(PARQUET.maxLength + 1e-9);
      expect(Math.abs(p.shade)).toBeLessThanOrEqual(1);
    }
  });

  it('staggers seams between neighbouring rows, including across the vertical wrap', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const l = parquetLayout(createRng(seed));
      for (let r = 0; r < l.length; r++) {
        const next = l[(r + 1) % l.length]!;
        expect(nearestSeam(seams(l[r]!, PARQUET.size), seams(next, PARQUET.size), PARQUET.size)).toBeGreaterThan(0.15);
      }
    }
  });

  it('is deterministic for a given seed, and varies between seeds', () => {
    expect(parquetLayout(createRng(7))).toEqual(parquetLayout(createRng(7)));
    expect(parquetLayout(createRng(7))).not.toEqual(parquetLayout(createRng(8)));
  });
});

describe('createFloorTexture', () => {
  it('returns null without a DOM canvas instead of throwing', () => {
    expect(createFloorTexture()).toBeNull();
  });
});
