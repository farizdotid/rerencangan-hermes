import { AGENT_STATES, type AgentState } from '../data/types';

/** How long a state change takes to blend in, in seconds. */
export const TRANSITION_SECONDS = 0.45;

export type StateWeights = Record<AgentState, number>;

export function oneHot(state: AgentState): StateWeights {
  const w = {} as StateWeights;
  for (const s of AGENT_STATES) w[s] = s === state ? 1 : 0;
  return w;
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * Tracks the target state and a blend from whatever the avatar looked like
 * when the state last changed. Changing state mid-transition starts from the
 * current blend, so poses never jump.
 */
export class AvatarStateMachine {
  private current: AgentState;
  private from: StateWeights;
  private progress = 1;

  constructor(initial: AgentState) {
    this.current = initial;
    this.from = oneHot(initial);
  }

  get state(): AgentState {
    return this.current;
  }

  get transitioning(): boolean {
    return this.progress < 1;
  }

  /** Returns true if the target state changed. */
  set(next: AgentState): boolean {
    if (next === this.current) return false;
    this.from = this.weights();
    this.current = next;
    this.progress = 0;
    return true;
  }

  update(dtSeconds: number): void {
    if (!(dtSeconds > 0)) return;
    this.progress = Math.min(1, this.progress + dtSeconds / TRANSITION_SECONDS);
  }

  /** Blend weights per state; they always sum to 1. */
  weights(out: StateWeights = {} as StateWeights): StateWeights {
    const e = smoothstep(this.progress);
    for (const s of AGENT_STATES) {
      out[s] = this.from[s] * (1 - e) + (s === this.current ? e : 0);
    }
    return out;
  }
}
