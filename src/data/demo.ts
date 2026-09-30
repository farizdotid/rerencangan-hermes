import type { AgentState } from './types';

/** Small seedable PRNG (mulberry32), returns values in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relative likelihood of each state in demo mode. */
export const DEMO_STATE_WEIGHTS: Readonly<Record<AgentState, number>> = {
  idle: 3,
  working: 4,
  celebrating: 1,
  error: 1,
  offline: 1,
};

export interface DemoOptions {
  minIntervalSeconds?: number;
  maxIntervalSeconds?: number;
  /** Chance that an idle spell lasts long enough for the agent to take a nap. */
  longIdleChance?: number;
  /** Length of such a long idle spell, in seconds. */
  longIdleSeconds?: readonly [number, number];
  rng?: () => number;
}

export interface DemoChange {
  id: string;
  state: AgentState;
}

/** Picks a random state different from `current`, following DEMO_STATE_WEIGHTS. */
export function pickState(current: AgentState, rng: () => number): AgentState {
  const options = (Object.keys(DEMO_STATE_WEIGHTS) as AgentState[]).filter((s) => s !== current);
  const total = options.reduce((sum, s) => sum + DEMO_STATE_WEIGHTS[s], 0);
  let r = rng() * total;
  for (const s of options) {
    r -= DEMO_STATE_WEIGHTS[s];
    if (r < 0) return s;
  }
  return options[options.length - 1]!;
}

/**
 * Fake data for demo mode: every agent changes to a random state every few
 * seconds. Pure logic, no timers; call `tick` with the current time.
 */
export class DemoGenerator {
  private readonly rng: () => number;
  private readonly minInterval: number;
  private readonly maxInterval: number;
  private readonly longIdleChance: number;
  private readonly longIdle: readonly [number, number];
  private readonly states = new Map<string, AgentState>();
  private readonly nextAt = new Map<string, number>();

  constructor(ids: readonly string[], nowSeconds: number, opts: DemoOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.minInterval = opts.minIntervalSeconds ?? 2;
    this.maxInterval = opts.maxIntervalSeconds ?? 6;
    this.longIdleChance = opts.longIdleChance ?? 0.3;
    this.longIdle = opts.longIdleSeconds ?? [200, 260];
    for (const id of ids) {
      this.states.set(id, 'idle');
      this.nextAt.set(id, nowSeconds + this.interval());
    }
  }

  stateOf(id: string): AgentState | undefined {
    return this.states.get(id);
  }

  /** Current state of every agent. */
  snapshot(): DemoChange[] {
    return [...this.states].map(([id, state]) => ({ id, state }));
  }

  /** Advances to `nowSeconds` and returns the agents whose state changed. */
  tick(nowSeconds: number): DemoChange[] {
    const changes: DemoChange[] = [];
    for (const [id, at] of this.nextAt) {
      if (nowSeconds < at) continue;
      const state = pickState(this.states.get(id) ?? 'idle', this.rng);
      this.states.set(id, state);
      const long = state === 'idle' && this.rng() < this.longIdleChance;
      this.nextAt.set(id, nowSeconds + (long ? this.longInterval() : this.interval()));
      changes.push({ id, state });
    }
    return changes;
  }

  private interval(): number {
    return this.minInterval + this.rng() * (this.maxInterval - this.minInterval);
  }

  private longInterval(): number {
    const [min, max] = this.longIdle;
    return min + this.rng() * (max - min);
  }
}
