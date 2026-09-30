import type { ServerResponse } from 'node:http';

export interface SseOptions {
  /** Interval between `ping` events (PRD: 15 s). */
  heartbeatMs?: number;
  /** Refuse new streams beyond this many, so a runaway tab cannot exhaust the server. */
  maxClients?: number;
  /** Reconnect delay suggested to EventSource. */
  retryMs?: number;
}

/** Drop a client whose unsent buffer grows past this (it stopped reading). */
const MAX_BUFFERED_BYTES = 1 << 20;

function frame(event: string, data: unknown): string {
  // JSON.stringify escapes newlines, so the payload is always a single data line.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Keeps open Server-Sent Events streams and fans events out to them. */
export class SseHub {
  private readonly clients = new Set<ServerResponse>();
  private readonly heartbeatMs: number;
  private readonly maxClients: number;
  private readonly retryMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(opts: SseOptions = {}) {
    this.heartbeatMs = opts.heartbeatMs ?? 15_000;
    this.maxClients = opts.maxClients ?? 16;
    this.retryMs = opts.retryMs ?? 3_000;
  }

  get size(): number {
    return this.clients.size;
  }

  /** Starts a stream on `res`. Returns false (and writes nothing) if the hub is full. */
  add(res: ServerResponse, initial?: { event: string; data: unknown }): boolean {
    if (this.clients.size >= this.maxClients) return false;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: ${this.retryMs}\n\n`);
    if (initial) res.write(frame(initial.event, initial.data));

    this.clients.add(res);
    res.on('close', () => this.remove(res));
    this.ensureHeartbeat();
    return true;
  }

  broadcast(event: string, data: unknown): void {
    if (this.clients.size === 0) return;
    const payload = frame(event, data);
    for (const res of this.clients) this.send(res, payload);
  }

  /** Ends every stream and stops the heartbeat. */
  close(): void {
    for (const res of this.clients) res.end();
    this.clients.clear();
    this.stopHeartbeat();
  }

  private send(res: ServerResponse, payload: string): void {
    if (res.writableLength > MAX_BUFFERED_BYTES) {
      res.destroy();
      this.remove(res);
      return;
    }
    res.write(payload);
  }

  private remove(res: ServerResponse): void {
    this.clients.delete(res);
    if (this.clients.size === 0) this.stopHeartbeat();
  }

  private ensureHeartbeat(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.broadcast('ping', { at: new Date().toISOString() }), this.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
