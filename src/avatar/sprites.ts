import * as THREE from 'three';

/** Local system fonts only; no web fonts are loaded (PRD section 0.5). */
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MAX_LABEL_CHARS = 24;

export interface TextSpriteOptions {
  /** Height of the sprite in world units. */
  worldHeight: number;
  color: string;
  background?: string;
  italic?: boolean;
}

/**
 * A camera-facing text sprite drawn on a canvas. Text is painted with
 * fillText (never parsed as HTML), and clamped in length.
 */
export function createTextSprite(text: string, opts: TextSpriteOptions): THREE.Sprite {
  const clean = Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, MAX_LABEL_CHARS).join('');
  const fontPx = 48;
  const padX = opts.background ? 22 : 4;
  const padY = opts.background ? 10 : 4;
  const font = `${opts.italic ? 'italic ' : ''}600 ${fontPx}px ${FONT_STACK}`;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  ctx.font = font;
  const textWidth = Math.ceil(ctx.measureText(clean).width);
  canvas.width = textWidth + padX * 2;
  canvas.height = fontPx + padY * 2;

  if (opts.background) {
    ctx.fillStyle = opts.background;
    const r = canvas.height / 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();
  }
  ctx.font = font; // resizing the canvas resets context state
  ctx.fillStyle = opts.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clean, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((opts.worldHeight * canvas.width) / canvas.height, opts.worldHeight, 1);
  return sprite;
}

/** Soft round glow, for the alarm halo. */
export function createGlowSprite(color: THREE.ColorRepresentation, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

/** Dispose a sprite's material and texture. */
export function disposeSprite(sprite: THREE.Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
