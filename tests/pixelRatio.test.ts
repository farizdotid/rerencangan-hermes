import { describe, expect, it } from 'vitest';
import { MAX_PIXEL_RATIO, clampPixelRatio } from '../src/scene/pixelRatio';

describe('clampPixelRatio', () => {
  it('passes through normal ratios', () => {
    expect(clampPixelRatio(1)).toBe(1);
    expect(clampPixelRatio(1.5)).toBe(1.5);
  });

  it('caps high ratios at the maximum', () => {
    expect(clampPixelRatio(3)).toBe(MAX_PIXEL_RATIO);
  });

  it('falls back to 1 for invalid input', () => {
    expect(clampPixelRatio(0)).toBe(1);
    expect(clampPixelRatio(-2)).toBe(1);
    expect(clampPixelRatio(Number.NaN)).toBe(1);
  });
});
