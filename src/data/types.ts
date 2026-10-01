/** Visual state of one agent; part of the snapshot data contract below. */
export const AGENT_STATES = ['idle', 'working', 'error', 'celebrating', 'offline'] as const;

export type AgentState = (typeof AGENT_STATES)[number];

export function isAgentState(value: unknown): value is AgentState {
  return typeof value === 'string' && (AGENT_STATES as readonly string[]).includes(value);
}

export type RunStatus = 'success' | 'failed';

/** One agent as sent to the browser. Status and numbers only; never prompt or log text. */
export interface AgentStatus {
  /** Profile name, e.g. "writer". */
  id: string;
  displayName: string;
  state: AgentState;
  /** True when the collector could not understand the Hermes output. */
  unknown?: boolean;
  /** Job name only, never the prompt. */
  currentTask?: string;
  lastRun?: { status: RunStatus; at: string };
  /** ISO 8601. */
  nextRunAt?: string;
  activeJobs: number;
}

export interface Snapshot {
  /** ISO 8601. */
  generatedAt: string;
  gateway: { running: boolean; heartbeatAgeSeconds?: number };
  agents: AgentStatus[];
}
