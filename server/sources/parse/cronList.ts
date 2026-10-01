import { cleanText } from '../../../src/data/validate';
import { findIso, toLines } from './text';

export type ExecutionState = 'running' | 'success' | 'failed' | 'none' | 'unknown';

export interface CronJob {
  /** Hermes job id. Used for bookkeeping only; never sent to the browser. */
  id: string;
  /** Lower-cased value in brackets after the id, e.g. "active". */
  status: string;
  name?: string;
  nextRunAt?: string;
  overdue: boolean;
  execution?: { state: ExecutionState; at?: string };
  /** From the "Last run:" line: when the last run finished and how it went. */
  lastRun?: { status: 'success' | 'failed'; at: string };
}

export interface CronList {
  /** False when the output did not look like `hermes cron list` at all. */
  recognized: boolean;
  profile?: string;
  jobs: CronJob[];
}

const MAX_JOBS = 200;
const JOB_HEADER = /^([A-Za-z0-9_-]{4,64})\s+\[([^\]\n]{1,32})\]$/;
const FIELD = /^([A-Za-z][A-Za-z ]{0,30}?)\s*:\s*(.*)$/;

/**
 * Maps the first word of the "Execution:" value to a state.
 * Confirmed by fixture: "running". The other words are an assumption until
 * real fixtures of finished and failed jobs are available.
 */
export function parseExecution(value: string): { state: ExecutionState; at?: string } {
  const word = value.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  let state: ExecutionState = 'unknown';
  if (word === 'running') state = 'running';
  else if (/^(?:success|succeeded|ok|completed|complete|done|finished)$/.test(word)) state = 'success';
  else if (/^(?:failed|failure|error|errored|crashed|timeout|timed-out)$/.test(word)) state = 'failed';
  else if (/^(?:none|idle|-|—|n\/a)$/.test(word) || word === '') state = 'none';
  const at = findIso(value);
  return at ? { state, at } : { state };
}

/**
 * Reads "Last run:  <ISO time>  <result>". Confirmed by a real fixture: "ok".
 * The failure words are an assumption until a fixture of a failed run exists.
 */
export function parseLastRun(value: string): CronJob['lastRun'] {
  const at = findIso(value);
  if (!at) return undefined;
  const result = value.slice(value.indexOf(at) + at.length).trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (/^(?:ok|success|succeeded|completed|done)$/.test(result)) return { status: 'success', at };
  if (/^(?:failed|fail|failure|error|errored|timeout|timed-out|crashed)$/.test(result)) return { status: 'failed', at };
  return undefined;
}

/** Parses `hermes cron list` for one profile. Unknown fields are ignored. */
export function parseCronList(raw: string): CronList {
  const out: CronList = { recognized: false, jobs: [] };
  let job: CronJob | null = null;

  for (const line of toLines(raw)) {
    let m: RegExpExecArray | null;

    if ((m = /scheduled\s+jobs\s*\(\s*profile\s*:\s*([^)]+?)\s*\)/i.exec(line))) {
      out.recognized = true;
      const profile = cleanText(m[1], 64);
      if (profile) out.profile = profile;
      continue;
    }
    if (/^no\s+(?:scheduled\s+|cron\s+)?jobs\b/i.test(line)) {
      out.recognized = true;
      continue;
    }
    if ((m = JOB_HEADER.exec(line))) {
      if (out.jobs.length >= MAX_JOBS) break;
      const status = m[2]!.trim().toLowerCase();
      job = { id: m[1]!, status, overdue: /overdue/.test(status) };
      out.jobs.push(job);
      out.recognized = true;
      continue;
    }
    if (!job || !(m = FIELD.exec(line))) continue;

    const key = m[1]!.trim().toLowerCase();
    const value = m[2]!;
    if (key === 'name') {
      const name = cleanText(value, 120);
      if (name) job.name = name;
    } else if (key === 'next run') {
      const iso = findIso(value);
      if (iso) job.nextRunAt = iso;
      if (/overdue/i.test(value)) job.overdue = true;
    } else if (key === 'dispatch') {
      if (/overdue/i.test(value)) job.overdue = true;
    } else if (key === 'execution') {
      job.execution = parseExecution(value);
    } else if (key === 'last run') {
      const last = parseLastRun(value);
      if (last) job.lastRun = last;
    }
  }
  return out;
}
