import { PROFILE_ID } from '../../config';
import { toLines } from './text';

export interface ProfileEntry {
  id: string;
  /** Marked as the sticky default profile (◆). */
  active: boolean;
  /** This profile's own gateway; null when the column is empty or unknown. */
  gatewayRunning: boolean | null;
}

export interface ProfileList {
  recognized: boolean;
  profiles: ProfileEntry[];
}

const MAX_PROFILES = 64;
const MARKER = /^[◆●*>]\s*/;

function gatewayState(value: string | undefined): boolean | null {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'running') return true;
  if (/^(?:stopped|not running|down|off|dead|inactive|exited)$/.test(v)) return false;
  return null;
}

/**
 * Parses `hermes profile list`: a table with Profile, Model, Gateway, Alias,
 * and Distribution columns. Only the profile id, the default marker, and the
 * gateway state are kept; model and alias are ignored.
 */
export function parseProfileList(raw: string): ProfileList {
  const out: ProfileList = { recognized: false, profiles: [] };
  let gatewayCol = -1;
  const seen = new Set<string>();

  for (const line of toLines(raw)) {
    const cells = line.split(/\s{2,}/);
    if (gatewayCol < 0) {
      if (cells[0]?.toLowerCase() === 'profile') {
        gatewayCol = cells.findIndex((c) => c.toLowerCase() === 'gateway');
        out.recognized = true;
      }
      continue;
    }
    if (out.profiles.length >= MAX_PROFILES) break;

    const active = MARKER.test(cells[0] ?? '');
    const id = (cells[0] ?? '').replace(MARKER, '');
    if (!PROFILE_ID.test(id) || seen.has(id)) continue;
    seen.add(id);

    let gateway = gatewayCol > 0 ? gatewayState(cells[gatewayCol]) : null;
    // If columns did not line up, look for a recognizable state anywhere in the row.
    if (gateway === null) {
      for (const c of cells.slice(1)) {
        const g = gatewayState(c);
        if (g !== null) {
          gateway = g;
          break;
        }
      }
    }
    out.profiles.push({ id, active, gatewayRunning: gateway });
  }
  return out;
}
