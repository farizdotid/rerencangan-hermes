import type { AgentState, AgentStatus, Snapshot } from './types';

/** Identity of the agent list; the crew is rebuilt only when this changes. */
export function rosterKey(agents: readonly Pick<AgentStatus, 'id' | 'displayName'>[]): string {
  return JSON.stringify(agents.map((a) => [a.id, a.displayName]));
}

/**
 * State each avatar should show. Everything reads offline when the gateway is
 * down, or when the server has been unreachable long enough that the last
 * snapshot can no longer be trusted.
 */
export function displayStates(snapshot: Snapshot, opts: { stale: boolean }): { id: string; state: AgentState }[] {
  const allOffline = opts.stale || !snapshot.gateway.running;
  return snapshot.agents.map((a) => ({ id: a.id, state: allOffline ? 'offline' : a.state }));
}

/** How many agents are in each state. */
export function countStates(states: readonly { state: AgentState }[]): Record<AgentState, number> {
  const counts: Record<AgentState, number> = { idle: 0, working: 0, error: 0, celebrating: 0, offline: 0 };
  for (const s of states) counts[s.state]++;
  return counts;
}

/** The earliest scheduled run across all agents, if any. */
export function nextScheduledRun(snapshot: Snapshot): { at: string; agent: string } | null {
  let best: { at: string; agent: string; t: number } | null = null;
  for (const a of snapshot.agents) {
    if (!a.nextRunAt) continue;
    const t = Date.parse(a.nextRunAt);
    if (Number.isFinite(t) && (!best || t < best.t)) best = { at: a.nextRunAt, agent: a.displayName, t };
  }
  return best && { at: best.at, agent: best.agent };
}
