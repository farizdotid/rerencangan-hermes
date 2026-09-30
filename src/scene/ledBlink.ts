/** Brightness of a LED that is "off" between blinks, so it never fully disappears. */
export const LED_DIM = 0.18;

/** Deterministic pseudo-random value in [0, 1) for a LED index. */
export function ledSeed(index: number): number {
  const x = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Brightness in [LED_DIM, 1] for LED `index` at `timeSeconds`.
 * Each LED gets its own rate and phase so the rack flickers like real activity.
 */
export function ledBrightness(timeSeconds: number, index: number): number {
  const seed = ledSeed(index);
  const rateHz = 0.6 + seed * 2.4;
  const phase = seed * Math.PI * 2;
  const wave = Math.sin(timeSeconds * rateHz * Math.PI * 2 + phase);
  return wave > 0.2 ? 1 : LED_DIM;
}
