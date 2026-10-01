import { describe, expect, it } from 'vitest';
import { nightFactor } from '../src/scene/daylight';

const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m);

describe('nightFactor', () => {
  it('is full night late in the evening and before dawn', () => {
    for (const [h, m] of [[0, 0], [3, 30], [4, 59], [19, 0], [22, 0], [23, 59]] as const) {
      expect(nightFactor(at(h, m))).toBe(1);
    }
  });

  it('is full day from mid-morning to late afternoon', () => {
    for (const [h, m] of [[6, 30], [9, 0], [12, 0], [15, 0], [17, 30]] as const) {
      expect(nightFactor(at(h, m))).toBe(0);
    }
  });

  it('fades smoothly at dawn and dusk', () => {
    expect(nightFactor(at(5, 45))).toBeCloseTo(0.5, 2);
    expect(nightFactor(at(18, 15))).toBeCloseTo(0.5, 2);
    let prev = nightFactor(at(17, 30));
    for (let m = 31; m <= 19 * 60 - 17 * 60; m++) {
      const v = nightFactor(at(17, m));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
