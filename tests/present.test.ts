import { describe, expect, it } from 'vitest';
import { countStates, displayStates, nextScheduledRun, rosterKey } from '../src/data/present';
import type { Snapshot } from '../src/data/types';

const snap = (running: boolean): Snapshot => ({
  generatedAt: '2026-10-01T10:00:00Z',
  gateway: { running },
  agents: [
    { id: 'a', displayName: 'A', state: 'working', activeJobs: 1 },
    { id: 'b', displayName: 'B', state: 'error', activeJobs: 0 },
  ],
});

describe('displayStates', () => {
  it('passes agent states through when all is well', () => {
    expect(displayStates(snap(true), { stale: false })).toEqual([
      { id: 'a', state: 'working' },
      { id: 'b', state: 'error' },
    ]);
  });

  it('shows everyone offline when the gateway is down', () => {
    expect(displayStates(snap(false), { stale: false }).map((s) => s.state)).toEqual(['offline', 'offline']);
  });

  it('shows everyone offline when data is stale', () => {
    expect(displayStates(snap(true), { stale: true }).map((s) => s.state)).toEqual(['offline', 'offline']);
  });
});

describe('rosterKey', () => {
  it('changes only when ids, names, or order change', () => {
    const base = rosterKey(snap(true).agents);
    expect(rosterKey([{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }])).toBe(base);
    expect(rosterKey([{ id: 'b', displayName: 'B' }, { id: 'a', displayName: 'A' }])).not.toBe(base);
    expect(rosterKey([{ id: 'a', displayName: 'A2' }, { id: 'b', displayName: 'B' }])).not.toBe(base);
  });
});

describe('countStates', () => {
  it('counts every state, including zeros', () => {
    expect(countStates([{ state: 'working' }, { state: 'working' }, { state: 'error' }])).toEqual({
      idle: 0,
      working: 2,
      error: 1,
      celebrating: 0,
      offline: 0,
    });
  });
});

describe('nextScheduledRun', () => {
  it('picks the earliest run across agents, comparing real instants', () => {
    const s = snap(true);
    s.agents[0]!.nextRunAt = '2026-10-01T23:00:00+07:00'; // 16:00Z
    s.agents[1]!.nextRunAt = '2026-10-01T15:30:00Z';
    expect(nextScheduledRun(s)).toEqual({ at: '2026-10-01T15:30:00Z', agent: 'B' });
  });

  it('returns null when nothing is scheduled', () => {
    expect(nextScheduledRun(snap(true))).toBeNull();
  });
});
