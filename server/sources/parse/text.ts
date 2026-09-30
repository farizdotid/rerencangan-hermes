import { isIsoDate } from '../../../src/data/validate';

/** Hard cap on how much text a parser looks at. */
const MAX_CHARS = 256 * 1024;

// ANSI CSI sequences (colors, cursor moves) and OSC sequences (titles, links).
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
// Box-drawing block, used by the CLI for table and header frames.
const BOX = /[─-╿]/g;

/** Turns raw CLI output into trimmed, non-empty lines of plain text. */
export function toLines(raw: string): string[] {
  return raw
    .slice(0, MAX_CHARS)
    .replace(ANSI, '')
    .replace(/\r\n?/g, '\n')
    .replace(BOX, ' ')
    .split('\n')
    .map((l) => l.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim())
    .filter((l) => l.length > 0);
}

const ISO_IN_TEXT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})/;

/** First valid ISO 8601 timestamp (with zone) found in `text`. */
export function findIso(text: string): string | undefined {
  const m = ISO_IN_TEXT.exec(text);
  return m && isIsoDate(m[0]) ? m[0] : undefined;
}

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** Parses durations like "9s ago", "2m 5s ago", "1h ago", "just now". */
export function parseAgo(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  if (t === 'just now' || t === 'now') return 0;
  const parts = [...t.matchAll(/(\d{1,7})\s*([smhd])\b/g)];
  if (parts.length === 0) return undefined;
  return parts.reduce((sum, [, n, unit]) => sum + Number(n) * UNIT_SECONDS[unit!]!, 0);
}
