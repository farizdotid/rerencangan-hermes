import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusClient, type ConnectionStatus, type EventSourceLike } from '../src/data/client';

class FakeEventSource implements EventSourceLike {
  static all: FakeEventSource[] = [];
  readyState = 0;
  onopen: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  closed = false;
  private listeners = new Map<string, ((ev: MessageEvent) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, l: (ev: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), l]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  emit(type: string, data: string) {
    for (const l of this.listeners.get(type) ?? []) l({ data } as MessageEvent);
  }
  fail(permanent: boolean) {
    this.readyState = permanent ? 2 : 0;
    this.onerror?.(new Event('error'));
  }
}

const SNAP = JSON.stringify({
  generatedAt: '2026-10-01T10:00:00Z',
  gateway: { running: true },
  agents: [{ id: 'a', displayName: 'A', state: 'working', activeJobs: 1 }],
});

let now = 0;
function setup() {
  const statuses: ConnectionStatus[] = [];
  const snapshots: unknown[] = [];
  const client = new StatusClient({
    onSnapshot: (s) => snapshots.push(s),
    onStatus: (s) => statuses.push(s),
    createEventSource: (url) => new FakeEventSource(url),
    now: () => now,
    staleMs: 45_000,
    minBackoffMs: 1000,
    maxBackoffMs: 8000,
  });
  client.start();
  return { client, statuses, snapshots, es: () => FakeEventSource.all.at(-1)! };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.all = [];
  now = 0;
});
afterEach(() => vi.useRealTimers());

describe('StatusClient', () => {
  it('reports connecting then connected, and delivers validated snapshots', () => {
    const { statuses, snapshots, es, client } = setup();
    expect(es().url).toBe('/events');
    es().open();
    es().emit('snapshot', SNAP);
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(snapshots).toHaveLength(1);
    client.stop();
  });

  it('ignores malformed or invalid snapshots', () => {
    const { snapshots, es, client } = setup();
    es().open();
    es().emit('snapshot', 'not json');
    es().emit('snapshot', JSON.stringify({ hello: 'world' }));
    expect(snapshots).toHaveLength(0);
    client.stop();
  });

  it('shows reconnecting while the browser retries by itself', () => {
    const { statuses, es, client } = setup();
    es().open();
    es().fail(false);
    expect(statuses.at(-1)).toBe('reconnecting');
    expect(FakeEventSource.all).toHaveLength(1); // no manual reconnect needed
    es().open();
    expect(statuses.at(-1)).toBe('connected');
    client.stop();
  });

  it('reconnects with exponential backoff when EventSource gives up', () => {
    const { statuses, client } = setup();
    FakeEventSource.all[0]!.open();
    FakeEventSource.all[0]!.fail(true);
    expect(FakeEventSource.all[0]!.closed).toBe(true);
    expect(statuses.at(-1)).toBe('reconnecting');

    vi.advanceTimersByTime(999);
    expect(FakeEventSource.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.all).toHaveLength(2);

    FakeEventSource.all[1]!.fail(true);
    vi.advanceTimersByTime(1999);
    expect(FakeEventSource.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.all).toHaveLength(3);

    FakeEventSource.all[2]!.open();
    expect(statuses.at(-1)).toBe('connected');
    // Backoff resets after a successful connection.
    FakeEventSource.all[2]!.fail(true);
    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.all).toHaveLength(4);
    client.stop();
  });

  it('caps backoff at maxBackoffMs', () => {
    const { client } = setup();
    for (let i = 0; i < 6; i++) {
      FakeEventSource.all.at(-1)!.fail(true);
      vi.advanceTimersByTime(8000);
    }
    const count = FakeEventSource.all.length;
    FakeEventSource.all.at(-1)!.fail(true);
    vi.advanceTimersByTime(7999);
    expect(FakeEventSource.all).toHaveLength(count);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.all).toHaveLength(count + 1);
    client.stop();
  });

  it('reconnects when the stream goes silent, but pings keep it alive', () => {
    const { client } = setup();
    FakeEventSource.all[0]!.open();
    for (let i = 0; i < 6; i++) {
      now += 15_000;
      FakeEventSource.all[0]!.emit('ping', '{}');
      vi.advanceTimersByTime(15_000);
    }
    expect(FakeEventSource.all).toHaveLength(1);

    now += 50_000;
    vi.advanceTimersByTime(15_000);
    expect(FakeEventSource.all[0]!.closed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.all).toHaveLength(2);
    client.stop();
  });

  it('ignores events from a replaced connection and stops cleanly', () => {
    const { snapshots, client } = setup();
    const first = FakeEventSource.all[0]!;
    first.fail(true);
    vi.advanceTimersByTime(1000);
    first.emit('snapshot', SNAP);
    expect(snapshots).toHaveLength(0);

    client.stop();
    expect(FakeEventSource.all.at(-1)!.closed).toBe(true);
    const count = FakeEventSource.all.length;
    vi.advanceTimersByTime(60_000);
    expect(FakeEventSource.all).toHaveLength(count);
  });
});
