import { PROFILE_ID } from '../../config';
import { findIso, parseAgo, toLines } from './text';

export interface CronStatus {
  /** False when the output did not look like `hermes cron status` at all. */
  recognized: boolean;
  /** null when the running state could not be determined. */
  gatewayRunning: boolean | null;
  heartbeatAgeSeconds?: number;
  activeJobs?: number;
  nextRunAt?: string;
  servedProfiles?: string[];
}

/**
 * Parses `hermes cron status`. Unknown lines are ignored; the PID is never kept.
 *
 * Confirmed by fixture: "Gateway is running". The "not running" patterns below
 * are an assumption until a real fixture of a stopped gateway is available.
 */
export function parseCronStatus(raw: string): CronStatus {
  const out: CronStatus = { recognized: false, gatewayRunning: null };

  for (const line of toLines(raw)) {
    if (/\bgateway\b.*\b(?:is\s+not|isn't|not)\s+running\b|\bgateway\b.*\b(?:stopped|down)\b|\bno\s+gateway\b/i.test(line)) {
      out.gatewayRunning = false;
      continue;
    }
    if (/\bgateway\s+is\s+running\b/i.test(line)) {
      out.gatewayRunning = true;
      continue;
    }

    let m: RegExpExecArray | null;
    if ((m = /^ticker\s+heartbeat\s*:\s*(.+)$/i.exec(line))) {
      const age = parseAgo(m[1]!);
      if (age !== undefined) out.heartbeatAgeSeconds = age;
    } else if ((m = /^(\d{1,6})\s+active\s+jobs?\b/i.exec(line))) {
      out.activeJobs = Number(m[1]);
    } else if ((m = /^next\s+run\s*:\s*(.+)$/i.exec(line))) {
      const iso = findIso(m[1]!);
      if (iso) out.nextRunAt = iso;
    } else if ((m = /\bserving\s+profiles?\s+(.+)$/i.exec(line))) {
      const names = m[1]!
        .split(',')
        .map((s) => s.trim())
        .filter((s) => PROFILE_ID.test(s));
      if (names.length > 0) out.servedProfiles = names.slice(0, 64);
    }
  }

  out.recognized = out.gatewayRunning !== null;
  return out;
}
