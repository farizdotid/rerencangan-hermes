import type { AgentStatus, RunStatus } from '../../src/data/types';

/** A failed run this recent shows the agent in `error` (PRD section 8, rule 2). */
export const ERROR_WINDOW_MS = 30 * 60 * 1000;
/** A successful run this recent shows the agent `celebrating` (rule 4). */
export const CELEBRATE_WINDOW_MS = 2 * 60 * 1000;

/** What the collector learned about one profile, before choosing a state. */
export interface AgentFacts {
  id: string;
  displayName: string;
  /** null when `cron status` failed or could not be understood. */
  gatewayRunning: boolean | null;
  /** False when this profile's output could not be understood. */
  understood: boolean;
  /** Name of a job whose execution is running, if any. */
  runningJob?: string;
  /** From `sessions list`, once that parser exists. */
  hasActiveSession?: boolean;
  lastRun?: { status: RunStatus; at: string };
  nextRunAt?: string;
  activeJobs: number;
}

function withinWindow(at: string, now: number, windowMs: number): boolean {
  const t = Date.parse(at);
  const age = now - t;
  // Allow a little clock skew into the future.
  return Number.isFinite(t) && age >= -60_000 && age <= windowMs;
}

/**
 * Applies the state rules in priority order (PRD section 8):
 * 1. gateway not running -> offline
 * 2. a failure in the last 30 minutes -> error
 * 3. a running execution or active session -> working
 * 4. a success in the last 2 minutes -> celebrating
 * 5. otherwise -> idle
 * Output that could not be understood yields idle with `unknown: true`.
 */
export function toAgentStatus(f: AgentFacts, now: number): AgentStatus {
  const status: AgentStatus = { id: f.id, displayName: f.displayName, state: 'idle', activeJobs: f.activeJobs };
  if (f.lastRun) status.lastRun = f.lastRun;
  if (f.nextRunAt) status.nextRunAt = f.nextRunAt;
  if (f.gatewayRunning === null || !f.understood) status.unknown = true;

  if (f.gatewayRunning !== true) {
    status.state = 'offline';
  } else if (!f.understood) {
    status.state = 'idle';
  } else if (f.lastRun?.status === 'failed' && withinWindow(f.lastRun.at, now, ERROR_WINDOW_MS)) {
    status.state = 'error';
  } else if (f.runningJob !== undefined || f.hasActiveSession) {
    status.state = 'working';
    if (f.runningJob) status.currentTask = f.runningJob;
  } else if (f.lastRun?.status === 'success' && withinWindow(f.lastRun.at, now, CELEBRATE_WINDOW_MS)) {
    status.state = 'celebrating';
  }
  return status;
}
