import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '../src/data/demo';
import { parseSnapshot } from '../src/data/validate';
import { createApp, isAllowedHost } from '../server/app';
import { DemoSource } from '../server/demo';
import { SseHub } from '../server/sse';

interface Running {
  server: Server;
  hub: SseHub;
  source: DemoSource;
  port: number;
}

const running: Running[] = [];

async function start(opts: { staticDir?: string | null; heartbeatMs?: number; maxClients?: number } = {}) {
  const source = new DemoSource([{ id: 'default', displayName: 'default' }, { id: 'writer', displayName: 'Writer' }], {
    rng: createRng(5),
  });
  const hub = new SseHub({ heartbeatMs: opts.heartbeatMs ?? 15_000, maxClients: opts.maxClients ?? 16 });
  source.onChange((s) => hub.broadcast('snapshot', s));
  const server = createApp({ source, hub, staticDir: opts.staticDir ?? null });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const r = { server, hub, source, port };
  running.push(r);
  return r;
}

afterEach(async () => {
  for (const r of running.splice(0)) {
    r.hub.close();
    r.source.stop();
    r.server.closeAllConnections();
    await new Promise((res) => r.server.close(res));
  }
});

function get(port: number, path: string, opts: { host?: string; method?: string } = {}) {
  return new Promise<{ status: number; headers: IncomingMessage['headers']; body: string }>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: { host: opts.host ?? `127.0.0.1:${port}` } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Opens an SSE stream and collects raw text until `until` matches. */
function openStream(port: number) {
  let buffer = '';
  let res: IncomingMessage | null = null;
  const waiters: { re: RegExp; resolve: () => void }[] = [];
  const req = request({ host: '127.0.0.1', port, path: '/events', headers: { host: `localhost:${port}` } }, (r) => {
    res = r;
    r.setEncoding('utf8');
    r.on('data', (c: string) => {
      buffer += c;
      for (const w of waiters.splice(0)) {
        if (w.re.test(buffer)) w.resolve();
        else waiters.push(w);
      }
    });
  });
  req.end();
  return {
    get text() {
      return buffer;
    },
    get response() {
      return res;
    },
    waitFor(re: RegExp, ms = 2000) {
      return new Promise<void>((resolve, reject) => {
        if (re.test(buffer)) return resolve();
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${re}; got: ${buffer}`)), ms);
        waiters.push({ re, resolve: () => (clearTimeout(t), resolve()) });
      });
    },
    close() {
      req.destroy();
    },
  };
}

function lastSnapshot(text: string): unknown {
  const matches = [...text.matchAll(/event: snapshot\ndata: (.*)\n\n/g)];
  return JSON.parse(matches.at(-1)![1]!);
}

describe('GET /api/agents', () => {
  it('returns a valid snapshot as JSON with safe headers', async () => {
    const { port } = await start();
    const res = await get(port, '/api/agents');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const parsed = parseSnapshot(JSON.parse(res.body));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.agents.map((a) => a.id)).toEqual(['default', 'writer']);
  });

  it('rejects foreign Host headers (DNS rebinding)', async () => {
    const { port } = await start();
    expect((await get(port, '/api/agents', { host: 'evil.example' })).status).toBe(403);
    expect((await get(port, '/api/agents', { host: `evil.example:${port}` })).status).toBe(403);
    expect((await get(port, '/api/agents', { host: '127.0.0.1.evil.example' })).status).toBe(403);
    expect((await get(port, '/api/agents', { host: 'localhost:8080' })).status).toBe(200);
    expect((await get(port, '/api/agents', { host: '[::1]:9600' })).status).toBe(200);
  });

  it('only allows GET and HEAD', async () => {
    const { port } = await start();
    const res = await get(port, '/api/agents', { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
    const head = await get(port, '/api/agents', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
  });

  it('answers 404 for unknown paths when no UI is built', async () => {
    const { port } = await start();
    expect((await get(port, '/')).status).toBe(404);
    expect((await get(port, '/api/other')).status).toBe(404);
  });
});

describe('GET /events', () => {
  it('sends retry and the current snapshot on connect, then changes', async () => {
    const { port, source } = await start();
    const s = openStream(port);
    await s.waitFor(/event: snapshot\ndata: .*\n\n/);
    expect(s.response?.headers['content-type']).toMatch(/text\/event-stream/);
    expect(s.text.startsWith('retry: 3000\n\n')).toBe(true);
    expect(parseSnapshot(lastSnapshot(s.text)).ok).toBe(true);

    const before = s.text.length;
    // Force a change by advancing the demo clock far ahead.
    (source as unknown as { now: () => number }).now = () => Date.now() + 60_000;
    source.tick();
    await s.waitFor(new RegExp(`^[\\s\\S]{${before}}[\\s\\S]*event: snapshot`));
    s.close();
  });

  it('sends ping heartbeats', async () => {
    const { port } = await start({ heartbeatMs: 40 });
    const s = openStream(port);
    await s.waitFor(/event: ping\ndata: \{"at":"[^"]+"\}\n\n/);
    s.close();
  });

  it('forgets clients that disconnect', async () => {
    const { port, hub } = await start();
    const s = openStream(port);
    await s.waitFor(/event: snapshot/);
    expect(hub.size).toBe(1);
    s.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.size).toBe(0);
  });

  it('refuses streams beyond the client limit', async () => {
    const { port } = await start({ maxClients: 1 });
    const s = openStream(port);
    await s.waitFor(/event: snapshot/);
    const res = await get(port, '/events');
    expect(res.status).toBe(503);
    s.close();
  });
});

describe('static files', () => {
  let base: string;

  async function withDist() {
    // base/secret.json sits right next to the build dir, so a traversal bug would expose it.
    base = mkdtempSync(join(tmpdir(), 'rh-dist-'));
    const dist = join(base, 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(base, 'secret.json'), '{"secret":true}');
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>x</title>');
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(dist, 'notes.txt'), 'nope');
    return start({ staticDir: dist });
  }

  afterEach(() => base && rmSync(base, { recursive: true, force: true }));

  it('serves index.html with a strict CSP and hashed assets as immutable', async () => {
    const { port } = await withDist();
    const index = await get(port, '/');
    expect(index.status).toBe(200);
    expect(index.headers['content-security-policy']).toContain("default-src 'self'");
    expect(index.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    const js = await get(port, '/assets/app-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toMatch(/text\/javascript/);
    expect(js.headers['cache-control']).toContain('immutable');
  });

  it('never serves files outside the build dir or with unknown types', async () => {
    const { port } = await withDist();
    for (const path of [
      '/../secret.json',
      '/%2e%2e/secret.json',
      '/assets/..%2f..%2fsecret.json',
      '/..%5csecret.json',
      '/../package.json',
      '/%2e%2e/package.json',
      '/assets/..%2f..%2fpackage.json',
      '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '/notes.txt',
      '/assets',
      '/%00',
      '/%E0%A4%A',
    ]) {
      expect((await get(port, path)).status, path).toBe(404);
    }
  });
});

describe('isAllowedHost', () => {
  it('matches exact loopback hostnames with optional port', () => {
    expect(isAllowedHost('127.0.0.1')).toBe(true);
    expect(isAllowedHost('LOCALHOST:9600')).toBe(true);
    expect(isAllowedHost('[::1]')).toBe(true);
    expect(isAllowedHost(undefined)).toBe(false);
    expect(isAllowedHost('localhost.evil.example')).toBe(false);
    expect(isAllowedHost('127.0.0.2')).toBe(false);
  });
});
