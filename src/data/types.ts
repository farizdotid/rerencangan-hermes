/** Visual state of one agent (PRD section 8: data contract). */
export const AGENT_STATES = ['idle', 'working', 'error', 'celebrating', 'offline'] as const;

export type AgentState = (typeof AGENT_STATES)[number];

export function isAgentState(value: unknown): value is AgentState {
  return typeof value === 'string' && (AGENT_STATES as readonly string[]).includes(value);
}
