import type { AgentState } from '../data/types';
import type { Desk } from '../scene/desk';
import { AGENT_COLORS } from '../scene/palette';
import { AgentAvatar } from './AgentAvatar';

export interface CrewMember {
  id: string;
  displayName: string;
}

/** All avatars, one per desk, in the order agents are listed. */
export class Crew {
  private readonly avatars = new Map<string, AgentAvatar>();

  constructor(members: readonly CrewMember[], desks: readonly Desk[]) {
    if (members.length > desks.length) {
      console.warn(`${members.length} agents but only ${desks.length} desks; extra agents are hidden`);
    }
    members.slice(0, desks.length).forEach((m, i) => {
      const avatar = new AgentAvatar({
        id: m.id,
        displayName: m.displayName,
        color: AGENT_COLORS[i % AGENT_COLORS.length]!,
        desk: desks[i]!,
      });
      this.avatars.set(m.id, avatar);
    });
  }

  get ids(): string[] {
    return [...this.avatars.keys()];
  }

  setState(id: string, state: AgentState): void {
    this.avatars.get(id)?.setState(state);
  }

  setAll(state: AgentState): void {
    for (const a of this.avatars.values()) a.setState(state);
  }

  update(dtSeconds: number, timeSeconds: number): void {
    for (const a of this.avatars.values()) a.update(dtSeconds, timeSeconds);
  }

  dispose(): void {
    for (const a of this.avatars.values()) a.dispose();
    this.avatars.clear();
  }
}
