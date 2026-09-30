import { isAgentState, type AgentStatus, type Snapshot } from './types';

/** Upper bounds that keep a malformed or hostile payload small. */
export const LIMITS = {
  agents: 64,
  id: 64,
  displayName: 64,
  currentTask: 120,
  activeJobs: 9999,
} as const;

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && ISO_8601.test(v) && Number.isFinite(Date.parse(v));
}

/** Collapse whitespace, strip control characters, clamp length. Empty result -> undefined. */
export function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length === 0) return undefined;
  return Array.from(s).slice(0, max).join('');
}

/** Validates one agent, copying only known fields. Returns null if unusable. */
export function parseAgent(input: unknown): AgentStatus | null {
  if (!isRecord(input)) return null;
  const id = cleanText(input.id, LIMITS.id);
  if (!id || !isAgentState(input.state)) return null;

  const jobs = input.activeJobs;
  const activeJobs =
    typeof jobs === 'number' && Number.isInteger(jobs) && jobs >= 0 ? Math.min(jobs, LIMITS.activeJobs) : 0;

  const agent: AgentStatus = {
    id,
    displayName: cleanText(input.displayName, LIMITS.displayName) ?? id,
    state: input.state,
    activeJobs,
  };
  if (input.unknown === true) agent.unknown = true;

  const task = cleanText(input.currentTask, LIMITS.currentTask);
  if (task) agent.currentTask = task;

  const last = input.lastRun;
  if (isRecord(last) && (last.status === 'success' || last.status === 'failed') && isIsoDate(last.at)) {
    agent.lastRun = { status: last.status, at: last.at };
  }
  if (isIsoDate(input.nextRunAt)) agent.nextRunAt = input.nextRunAt;
  return agent;
}

/**
 * Validates a snapshot from untrusted JSON. Unknown fields are dropped;
 * invalid or duplicate agents are skipped rather than failing the whole snapshot.
 */
export function parseSnapshot(input: unknown): ParseResult<Snapshot> {
  if (!isRecord(input)) return { ok: false, error: 'snapshot is not an object' };
  if (!isIsoDate(input.generatedAt)) return { ok: false, error: 'generatedAt is not an ISO 8601 date' };
  const gw = input.gateway;
  if (!isRecord(gw) || typeof gw.running !== 'boolean') return { ok: false, error: 'gateway.running missing' };
  if (!Array.isArray(input.agents)) return { ok: false, error: 'agents is not an array' };

  const gateway: Snapshot['gateway'] = { running: gw.running };
  const age = gw.heartbeatAgeSeconds;
  if (typeof age === 'number' && Number.isFinite(age) && age >= 0) gateway.heartbeatAgeSeconds = age;

  const agents: AgentStatus[] = [];
  const seen = new Set<string>();
  for (const raw of input.agents.slice(0, LIMITS.agents)) {
    const agent = parseAgent(raw);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    agents.push(agent);
  }
  return { ok: true, value: { generatedAt: input.generatedAt, gateway, agents } };
}
