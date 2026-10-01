import { parseAgo, toLines } from './text';

export interface SessionEntry {
  /** Sessions started by the scheduler have ids starting with "cron_". */
  kind: 'cron' | 'chat';
  /** Seconds since the session was last active; null if unknown. */
  lastActiveSeconds: number | null;
}

export interface SessionsList {
  recognized: boolean;
  sessions: SessionEntry[];
}

const MAX_SESSIONS = 500;
const DAY = 86_400;

// "Last Active" and "ID" are the last two columns; titles before them are free text.
const ROW_TAIL =
  /(just now|now|today|yesterday|\d{1,6}\s*[smhdw]\s+ago|\d{1,6}\s*(?:sec|second|min|minute|hour|day|week)s?\s+ago)\s+(\S{1,128})$/i;

function lastActive(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (t === 'yesterday') return DAY;
  if (t === 'today') return null;
  const words = /^(\d{1,6})\s*(sec|second|min|minute|hour|day|week)s?\s+ago$/.exec(t);
  if (words) {
    const unit = { sec: 1, second: 1, min: 60, minute: 60, hour: 3600, day: DAY, week: 7 * DAY }[words[2]!]!;
    return Number(words[1]) * unit;
  }
  const weeks = /^(\d{1,6})\s*w\s+ago$/.exec(t);
  if (weeks) return Number(weeks[1]) * 7 * DAY;
  return parseAgo(t) ?? null;
}

/**
 * Parses `hermes sessions list`. Session titles are free text written by
 * people and models, so they are dropped here and never leave this module;
 * only how long ago each session was active, and whether cron started it.
 */
export function parseSessionsList(raw: string): SessionsList {
  const out: SessionsList = { recognized: false, sessions: [] };
  for (const line of toLines(raw)) {
    if (/^title\s+.*\blast active\b.*\bid$/i.test(line)) {
      out.recognized = true;
      continue;
    }
    if (/^no\s+sessions\b/i.test(line)) {
      out.recognized = true;
      continue;
    }
    if (!out.recognized || out.sessions.length >= MAX_SESSIONS) continue;
    const m = ROW_TAIL.exec(line);
    if (!m) continue;
    out.sessions.push({
      kind: m[2]!.startsWith('cron_') ? 'cron' : 'chat',
      lastActiveSeconds: lastActive(m[1]!),
    });
  }
  return out;
}

/** Seconds since the most recently active session, or null if none is known. */
export function mostRecentActivity(list: SessionsList): number | null {
  let best: number | null = null;
  for (const s of list.sessions) {
    if (s.lastActiveSeconds !== null && (best === null || s.lastActiveSeconds < best)) best = s.lastActiveSeconds;
  }
  return best;
}
