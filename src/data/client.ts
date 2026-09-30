import type { Snapshot } from './types';
import { parseSnapshot } from './validate';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

/** The subset of EventSource this client uses, so tests can pass a fake. */
export interface EventSourceLike {
  readonly readyState: number;
  onopen: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export interface StatusClientOptions {
  url?: string;
  onSnapshot: (snapshot: Snapshot) => void;
  onStatus?: (status: ConnectionStatus) => void;
  /** Reconnect if nothing (not even a ping) arrives for this long. Server pings every 15 s. */
  staleMs?: number;
  /** Backoff for reconnects the browser gives up on (e.g. HTTP 5xx or 404). */
  minBackoffMs?: number;
  maxBackoffMs?: number;
  createEventSource?: EventSourceFactory;
  now?: () => number;
}

const CLOSED = 2;

/**
 * Subscribes to the server's SSE stream. EventSource retries dropped
 * connections by itself; this adds a retry with backoff for the cases where
 * it gives up (non-200 responses), plus a watchdog for silent stalls.
 */
export class StatusClient {
  private readonly url: string;
  private readonly opts: StatusClientOptions;
  private readonly staleMs: number;
  private readonly minBackoff: number;
  private readonly maxBackoff: number;
  private readonly create: EventSourceFactory;
  private readonly now: () => number;

  private es: EventSourceLike | null = null;
  private status: ConnectionStatus | null = null;
  private everConnected = false;
  private attempts = 0;
  private lastMessageAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: StatusClientOptions) {
    this.opts = opts;
    this.url = opts.url ?? '/events';
    this.staleMs = opts.staleMs ?? 45_000;
    this.minBackoff = opts.minBackoffMs ?? 1_000;
    this.maxBackoff = opts.maxBackoffMs ?? 5_000;
    this.create = opts.createEventSource ?? ((url) => new EventSource(url));
    this.now = opts.now ?? Date.now;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
    this.watchdog = setInterval(() => this.checkStale(), Math.max(1000, this.staleMs / 3));
  }

  stop(): void {
    this.running = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.retryTimer = null;
    this.watchdog = null;
    this.es?.close();
    this.es = null;
  }

  private connect(): void {
    this.setStatus(this.everConnected ? 'reconnecting' : 'connecting');
    const es = this.create(this.url);
    this.es = es;
    this.lastMessageAt = this.now();

    es.onopen = () => {
      if (es !== this.es) return;
      this.everConnected = true;
      this.attempts = 0;
      this.lastMessageAt = this.now();
      this.setStatus('connected');
    };
    es.onerror = () => {
      if (es !== this.es) return;
      if (es.readyState === CLOSED) this.scheduleReconnect();
      else this.setStatus(this.everConnected ? 'reconnecting' : 'connecting');
    };
    es.addEventListener('snapshot', (ev) => {
      if (es !== this.es) return;
      this.lastMessageAt = this.now();
      let data: unknown;
      try {
        data = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const result = parseSnapshot(data);
      if (result.ok) this.opts.onSnapshot(result.value);
    });
    es.addEventListener('ping', () => {
      if (es === this.es) this.lastMessageAt = this.now();
    });
  }

  private scheduleReconnect(): void {
    this.es?.close();
    this.es = null;
    if (!this.running || this.retryTimer) return;
    this.setStatus(this.everConnected ? 'reconnecting' : 'connecting');
    const delay = Math.min(this.maxBackoff, this.minBackoff * 2 ** this.attempts);
    this.attempts++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.running) this.connect();
    }, delay);
  }

  private checkStale(): void {
    if (this.es && this.now() - this.lastMessageAt > this.staleMs) this.scheduleReconnect();
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.opts.onStatus?.(status);
  }
}
