import { readFile, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Self-only CSP for the app page: no inline scripts, no third-party hosts. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Serves a file from `root` (the Vite build). Returns false when there is no
 * such file, so the caller can answer 404. Paths outside `root` are never read.
 */
export async function serveStatic(pathname: string, root: string, res: ServerResponse, head: boolean): Promise<boolean> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;

  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = resolve(root, rel);
  if (!file.startsWith(root + sep)) return false;

  const type = TYPES[extname(file).toLowerCase()];
  if (!type) return false;

  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    const body = await readFile(file);
    const isHtml = type.startsWith('text/html');
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      // Vite puts content hashes in asset names, so those can be cached for good.
      'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(isHtml ? { 'Content-Security-Policy': CSP } : {}),
    });
    res.end(head ? undefined : body);
    return true;
  } catch {
    return false;
  }
}
