import type { ConnectionStatus } from '../data/client';

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Menghubungkan…',
  connected: 'Terhubung',
  reconnecting: 'Menyambung ulang…',
};

/** Small pill showing the server connection. */
export class ConnectionIndicator {
  private readonly el = document.createElement('div');
  private readonly text = document.createElement('span');

  constructor(parent: HTMLElement) {
    this.el.className = 'conn';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    const dot = document.createElement('span');
    dot.className = 'conn-dot';
    this.el.append(dot, this.text);
    parent.appendChild(this.el);
    this.set('connecting');
  }

  set(status: ConnectionStatus): void {
    this.el.dataset.status = status;
    this.text.textContent = LABELS[status];
  }

  dispose(): void {
    this.el.remove();
  }
}
