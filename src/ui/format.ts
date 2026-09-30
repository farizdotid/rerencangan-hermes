import type { AgentState } from '../data/types';

/** Indonesian labels for agent states, as shown in the UI. */
export const STATE_LABELS: Record<AgentState, string> = {
  working: 'Bekerja',
  idle: 'Santai',
  celebrating: 'Merayakan',
  error: 'Error',
  offline: 'Offline',
};

/** Display order in the HUD: most interesting first. */
export const STATE_ORDER: readonly AgentState[] = ['working', 'error', 'celebrating', 'idle', 'offline'];

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function span(ms: number): string {
  if (ms < MINUTE) return `${Math.floor(ms / SECOND)} dtk`;
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} mnt`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} jam`;
  return `${Math.floor(ms / DAY)} hari`;
}

/** "baru saja", "12 dtk lalu", "5 mnt lalu", "2 jam lalu", "3 hari lalu". */
export function formatAgo(ms: number): string {
  if (!Number.isFinite(ms) || ms < 5 * SECOND) return 'baru saja';
  return `${span(ms)} lalu`;
}

/** "dalam 5 mnt", "sekarang", or "terlambat 3 mnt" for times in the past. */
export function formatUntil(ms: number): string {
  if (!Number.isFinite(ms) || Math.abs(ms) < 30 * SECOND) return 'sekarang';
  return ms > 0 ? `dalam ${span(ms)}` : `terlambat ${span(-ms)}`;
}

function dayKey(t: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

/**
 * Wall-clock time of `iso` in the viewer's time zone: "23.00" today,
 * "besok 23.00", "kemarin 07.30", otherwise "1 Okt 23.00".
 */
export function formatClock(iso: string, now: number, timeZone?: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const time = new Intl.DateTimeFormat('id-ID', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
  const day = dayKey(t, timeZone);
  if (day === dayKey(now, timeZone)) return time;
  if (day === dayKey(now + DAY, timeZone)) return `besok ${time}`;
  if (day === dayKey(now - DAY, timeZone)) return `kemarin ${time}`;
  const date = new Intl.DateTimeFormat('id-ID', { timeZone, day: 'numeric', month: 'short' }).format(t);
  return `${date.replace('.', '')} ${time}`;
}
