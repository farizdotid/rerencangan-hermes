import { describe, expect, it } from 'vitest';
import { LED_DIM, ledBrightness, ledSeed } from '../src/scene/ledBlink';

describe('ledBlink', () => {
  it('seeds are in [0, 1) and differ between LEDs', () => {
    const seeds = Array.from({ length: 18 }, (_, i) => ledSeed(i));
    for (const s of seeds) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it('is deterministic', () => {
    expect(ledBrightness(3.7, 5)).toBe(ledBrightness(3.7, 5));
  });

  it('only returns dim or full brightness, and actually blinks', () => {
    const samples = Array.from({ length: 200 }, (_, i) => ledBrightness(i * 0.05, 2));
    for (const b of samples) expect([LED_DIM, 1]).toContain(b);
    expect(samples).toContain(LED_DIM);
    expect(samples).toContain(1);
  });
});
