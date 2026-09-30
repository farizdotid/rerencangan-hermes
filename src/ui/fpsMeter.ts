/** Tiny FPS readout for development. Not shipped in production builds. */
export class FpsMeter {
  private readonly el = document.createElement('div');
  private frames = 0;
  private windowStart = performance.now();

  constructor(parent: HTMLElement) {
    this.el.className = 'fps-meter';
    this.el.textContent = '-- fps';
    parent.appendChild(this.el);
  }

  tick(now = performance.now()): void {
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed >= 500) {
      this.el.textContent = `${Math.round((this.frames * 1000) / elapsed)} fps`;
      this.frames = 0;
      this.windowStart = now;
    }
  }

  /** Drop the partial window, e.g. after the tab was hidden. */
  reset(): void {
    this.frames = 0;
    this.windowStart = performance.now();
  }
}
