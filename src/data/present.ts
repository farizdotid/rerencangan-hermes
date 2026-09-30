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
