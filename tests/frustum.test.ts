import { describe, expect, it } from 'vitest';
import { fitOrthoFrustum } from '../src/scene/frustum';

describe('fitOrthoFrustum', () => {
  it('uses the minimum height on wide screens', () => {
    const f = fitOrthoFrustum(2, 10, 16);
    expect(f.top - f.bottom).toBeCloseTo(10);
    expect(f.right - f.left).toBeCloseTo(20);
  });

  it('grows height on narrow screens so the minimum width still fits', () => {
    const f = fitOrthoFrustum(0.5, 10, 16);
    expect(f.right - f.left).toBeCloseTo(16);
    expect(f.top - f.bottom).toBeCloseTo(32);
  });

  it('is centered', () => {
    const f = fitOrthoFrustum(1.5, 10, 16);
    expect(f.left).toBeCloseTo(-f.right);
    expect(f.bottom).toBeCloseTo(-f.top);
  });

  it('falls back to a square aspect for invalid input', () => {
    expect(fitOrthoFrustum(0, 10, 10)).toEqual(fitOrthoFrustum(1, 10, 10));
    expect(fitOrthoFrustum(Number.NaN, 10, 10)).toEqual(fitOrthoFrustum(1, 10, 10));
  });
});
