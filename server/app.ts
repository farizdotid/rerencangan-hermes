import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { StatusSource } from './source';
import type { SseHub } from './sse';
import { serveStatic } from './static';

export interface AppOptions {
  source: StatusSource;
  hub: SseHub;
  /** Absolute path of the built frontend, or null to serve the API only. */
  staticDir: string | null;
}

/**
 * Hostnames the server answers to. Checking Host blocks DNS-rebinding: a
 * hostile web page cannot make the browser read this API through its own
 * domain name. Any port is fine, so SSH tunnels on other local ports work.
 */
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isAllowedHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const match = /^(\[[^\]]+\]|[^:]+)(?::\d{1,5})?$/.exec(hostHeader.trim().toLowerCase());
  return match !== null && ALLOWED_HOSTNAMES.has(match[1]!);
}

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

function sendText(res: ServerResponse, status: number, text: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(text);
}

function sendJson(res: ServerResponse, body: unknown, head: boolean): void {
  const json = JSON.stringify(body);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
  });
  res.end(head ? undefined : json);
}

export function createApp({ source, hub, staticDir }: AppOptions): Server {
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    for (const [k, v] of Object.entries(BASE_HEADERS)) res.setHeader(k, v);

    if (!isAllowedHost(req.headers.host)) return sendText(res, 403, 'Forbidden host\n');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendText(res, 405, 'Method not allowed\n', { Allow: 'GET, HEAD' });
    }
    const head = req.method === 'HEAD';

    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      return sendText(res, 400, 'Bad request\n');
    }

    if (pathname === '/api/agents') return sendJson(res, source.snapshot(), head);

    if (pathname === '/events') {
      if (head) return sendText(res, 200, '', { 'Content-Type': 'text/event-stream' });
      const ok = hub.add(res, { event: 'snapshot', data: source.snapshot() });
      if (!ok) sendText(res, 503, 'Too many open streams\n', { 'Retry-After': '5' });
      return;
    }

    if (staticDir && (await serveStatic(pathname, staticDir, res, head))) return;
    sendText(res, 404, 'Not found\n');
  };

  return createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) sendText(res, 500, 'Internal error\n');
      else res.destroy();
    });
  });
}
