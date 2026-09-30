import { describe, expect, it } from 'vitest';
import { CELEBRATE_WINDOW_MS, ERROR_WINDOW_MS, toAgentStatus, type AgentFacts } from '../server/sources/mapStatus';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const base: AgentFacts = { id: 'writer', displayName: 'Writer', gatewayRunning: true, understood: true, activeJobs: 1 };
const state = (f: Partial<AgentFacts>) => toAgentStatus({ ...base, ...f }, NOW).state;

describe('toAgentStatus rule priority', () => {
  it('1. gateway down beats everything', () => {
    expect(state({ gatewayRunning: false, runningJob: 'x', lastRun: { status: 'failed', at: ago(1000) } })).toBe('offline');
  });

  it('gateway unknown also shows offline, flagged unknown', () => {
    const s = toAgentStatus({ ...base, gatewayRunning: null }, NOW);
    expect(s.state).toBe('offline');
    expect(s.unknown).toBe(true);
  });

  it('2. recent failure beats running', () => {
    expect(state({ runningJob: 'x', lastRun: { status: 'failed', at: ago(60_000) } })).toBe('error');
  });

  it('failure older than the error window no longer counts', () => {
    expect(state({ lastRun: { status: 'failed', at: ago(ERROR_WINDOW_MS - 1000) } })).toBe('error');
    expect(state({ lastRun: { status: 'failed', at: ago(ERROR_WINDOW_MS + 1000) } })).toBe('idle');
  });

  it('3. running job or active session -> working, with job name only', () => {
    const s = toAgentStatus({ ...base, runningJob: 'Daily article job' }, NOW);
    expect(s.state).toBe('working');
    expect(s.currentTask).toBe('Daily article job');
    expect(state({ hasActiveSession: true })).toBe('working');
    expect(toAgentStatus({ ...base, runningJob: '' }, NOW).currentTask).toBeUndefined();
  });

  it('3 beats 4: running beats a recent success', () => {
    expect(state({ runningJob: 'x', lastRun: { status: 'success', at: ago(1000) } })).toBe('working');
  });

  it('4. success within the celebrate window -> celebrating, then idle', () => {
    expect(state({ lastRun: { status: 'success', at: ago(CELEBRATE_WINDOW_MS - 1000) } })).toBe('celebrating');
    expect(state({ lastRun: { status: 'success', at: ago(CELEBRATE_WINDOW_MS + 1000) } })).toBe('idle');
  });

  it('5. nothing going on -> idle', () => {
    expect(state({})).toBe('idle');
  });

  it('unparseable output -> idle + unknown (unless the gateway is down)', () => {
    const s = toAgentStatus({ ...base, understood: false, runningJob: 'x' }, NOW);
    expect(s.state).toBe('idle');
    expect(s.unknown).toBe(true);
    expect(state({ understood: false, gatewayRunning: false })).toBe('offline');
  });

  it('ignores timestamps far in the future', () => {
    expect(state({ lastRun: { status: 'failed', at: new Date(NOW + 3_600_000).toISOString() } })).toBe('idle');
  });

  it('copies lastRun and nextRunAt through', () => {
    const s = toAgentStatus({ ...base, lastRun: { status: 'success', at: ago(1e7) }, nextRunAt: '2026-10-01T23:00:00+07:00' }, NOW);
    expect(s.lastRun).toEqual({ status: 'success', at: ago(1e7) });
    expect(s.nextRunAt).toBe('2026-10-01T23:00:00+07:00');
  });
});
