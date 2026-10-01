/** Upper bound for renderer pixel ratio, so high-DPI screens do not overload the GPU. */
export const MAX_PIXEL_RATIO = 2;

/** Clamp a device pixel ratio to a sane range for rendering. */
export function clampPixelRatio(devicePixelRatio: number, max = MAX_PIXEL_RATIO): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, max);
}
