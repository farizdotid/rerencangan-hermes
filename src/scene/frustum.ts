export interface OrthoFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Orthographic frustum that shows at least `minHeight` world units vertically
 * and `minWidth` horizontally, whatever the viewport aspect ratio.
 */
export function fitOrthoFrustum(aspect: number, minHeight: number, minWidth: number): OrthoFrustum {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfH = Math.max(minHeight / 2, minWidth / 2 / safeAspect);
  const halfW = halfH * safeAspect;
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}
