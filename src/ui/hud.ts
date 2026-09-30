import { countStates, nextScheduledRun } from '../data/present';
import type { AgentState, Snapshot } from '../data/types';
import { STATE_LABELS, STATE_ORDER, formatAgo, formatClock, formatUntil } from './format';

export interface HudData {
  snapshot: Snapshot | null;
  /** States as shown on screen (after gateway/stale rules). */
  shown: readonly { id: string; state: AgentState }[];
  stale: boolean;
  /** Client clock time the last snapshot arrived; avoids server/client clock skew. */
  receivedAt: number | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.appendChild(node);
  return node;
}

/**
 * Summary card in the top-right: gateway health, how many agents are in each
 * state, the next scheduled job, and how fresh the data is. Text only via
 * textContent.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly gateway: HTMLDivElement;
  private readonly gatewayText: HTMLSpanElement;
  private readonly heartbeatRow: HTMLDivElement;
  private readonly heartbeat: HTMLSpanElement;
  private readonly chips = new Map<AgentState, { chip: HTMLSpanElement; count: HTMLElement }>();
  private readonly nextRun: HTMLSpanElement;
  private readonly updated: HTMLSpanElement;
  private data: HudData = { snapshot: null, shown: [], stale: false, receivedAt: null };

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    this.card = el('div', 'hud-card');
    this.card.setAttribute('aria-label', 'Ringkasan status');

    this.gateway = el('div', 'hud-row hud-gateway', this.card);
    el('span', 'hud-dot', this.gateway);
    this.gatewayText = el('span', '', this.gateway);

    this.heartbeatRow = el('div', 'hud-row hud-muted', this.card);
    el('span', 'hud-label', this.heartbeatRow).textContent = 'Heartbeat';
    this.heartbeat = el('span', 'hud-value', this.heartbeatRow);

    const states = el('div', 'hud-states', this.card);
    for (const s of STATE_ORDER) {
      const chip = el('span', 'hud-chip', states);
      chip.dataset.state = s;
      el('span', 'hud-dot', chip);
      const count = el('b', '', chip);
      el('span', '', chip).textContent = STATE_LABELS[s];
      this.chips.set(s, { chip, count });
    }

    const next = el('div', 'hud-row', this.card);
    el('span', 'hud-label', next).textContent = 'Job berikutnya';
    this.nextRun = el('span', 'hud-value', next);

    const upd = el('div', 'hud-row hud-muted', this.card);
    el('span', 'hud-label', upd).textContent = 'Diperbarui';
    this.updated = el('span', 'hud-value', upd);
  }

  /** Call after the connection pill has been added, so the card sits below it. */
  mount(): void {
    this.root.appendChild(this.card);
    this.render(Date.now());
  }

  set(data: HudData): void {
    this.data = data;
    this.render(Date.now());
  }

  /** Re-renders relative times; call about once a second. */
  render(now: number): void {
    const { snapshot, shown, stale, receivedAt } = this.data;
    const since = receivedAt === null ? null : now - receivedAt;

    let status: 'ok' | 'down' | 'unknown' = 'unknown';
    if (!snapshot) this.gatewayText.textContent = 'Gateway: menunggu data…';
    else if (stale) this.gatewayText.textContent = 'Gateway: tidak diketahui';
    else if (snapshot.gateway.running) {
      status = 'ok';
      this.gatewayText.textContent = 'Gateway berjalan';
    } else {
      status = 'down';
      this.gatewayText.textContent = 'Gateway mati';
    }
    this.gateway.dataset.status = status;

    // Heartbeat age as reported, plus the time since that report arrived.
    const hb = snapshot?.gateway.heartbeatAgeSeconds;
    const showHb = status === 'ok' && hb !== undefined && since !== null;
    this.heartbeatRow.hidden = !showHb;
    if (showHb) this.heartbeat.textContent = formatAgo(hb * 1000 + since);

    const counts = countStates(shown);
    for (const [s, { chip, count }] of this.chips) {
      count.textContent = String(counts[s]);
      chip.classList.toggle('is-zero', counts[s] === 0);
    }

    const next = snapshot && nextScheduledRun(snapshot);
    this.nextRun.textContent = next
      ? `${formatClock(next.at, now)} · ${next.agent} · ${formatUntil(Date.parse(next.at) - now)}`
      : '—';

    this.updated.textContent = since === null ? '—' : formatAgo(since);
  }

  dispose(): void {
    this.root.remove();
  }
}
