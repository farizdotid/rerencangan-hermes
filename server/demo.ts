import { DemoGenerator, type DemoOptions } from '../src/data/demo';
import type { AgentState, AgentStatus, Snapshot } from '../src/data/types';
import type { AgentConfig } from './config';
import type { StatusSource } from './source';

export interface DemoSourceOptions extends DemoOptions {
  /** How often the generator is advanced. */
  tickMs?: number;
  /** Clock in milliseconds; injectable for tests. */
  now?: () => number;
}

const HOUR_MS = 3_600_000;

interface AgentMemory {
  lastRun?: AgentStatus['lastRun'];
}

/** Fake snapshots for demo mode. Never touches Hermes. */
export class DemoSource implements StatusSource {
  private readonly agents: readonly AgentConfig[];
  private readonly generator: DemoGenerator;
  private readonly memory = new Map<string, AgentMemory>();
  private readonly listeners = new Set<(s: Snapshot) => void>();
  private readonly tickMs: number;
  private readonly now: () => number;
  private current: Snapshot;
  private timer: NodeJS.Timeout | null = null;

  constructor(agents: readonly AgentConfig[], opts: DemoSourceOptions = {}) {
    this.agents = agents;
    this.tickMs = opts.tickMs ?? 1000;
    this.now = opts.now ?? Date.now;
    this.generator = new DemoGenerator(
      agents.map((a) => a.id),
      this.now() / 1000,
      opts,
    );
    for (const a of agents) this.memory.set(a.id, {});
    this.current = this.build();
  }

  snapshot(): Snapshot {
    return this.current;
  }

  onChange(listener: (s: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Advances the generator once; exposed for tests. */
  tick(): void {
    const changes = this.generator.tick(this.now() / 1000);
    if (changes.length === 0) return;
    const at = new Date(this.now()).toISOString();
    for (const { id, state } of changes) {
      const mem = this.memory.get(id);
      if (!mem) continue;
      if (state === 'celebrating') mem.lastRun = { status: 'success', at };
      if (state === 'error') mem.lastRun = { status: 'failed', at };
    }
    this.current = this.build();
    for (const l of this.listeners) l(this.current);
  }

  private build(): Snapshot {
    const now = this.now();
    const nextHour = Math.ceil(now / HOUR_MS) * HOUR_MS;
    const agents = this.agents.map((a, i): AgentStatus => {
      const state: AgentState = this.generator.stateOf(a.id) ?? 'idle';
      const status: AgentStatus = {
        id: a.id,
        displayName: a.displayName,
        state,
        activeJobs: state === 'working' ? 1 : 0,
        nextRunAt: new Date(nextHour + i * HOUR_MS).toISOString(),
      };
      if (state === 'working') status.currentTask = `Demo job ${i + 1}`;
      const last = this.memory.get(a.id)?.lastRun;
      if (last) status.lastRun = last;
      return status;
    });
    return {
      generatedAt: new Date(now).toISOString(),
      gateway: { running: true, heartbeatAgeSeconds: 0 },
      agents,
    };
  }
}
