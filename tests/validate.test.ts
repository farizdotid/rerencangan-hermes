import { describe, expect, it } from 'vitest';
import { LIMITS, cleanText, isIsoDate, parseAgent, parseSnapshot } from '../src/data/validate';

const good = {
  generatedAt: '2026-10-01T10:00:00Z',
  gateway: { running: true, heartbeatAgeSeconds: 9 },
  agents: [
    {
      id: 'writer',
      displayName: 'Writer',
      state: 'working',
      currentTask: 'Daily article job',
      lastRun: { status: 'success', at: '2026-09-30T23:00:00+07:00' },
      nextRunAt: '2026-10-01T23:00:00+07:00',
      activeJobs: 1,
    },
  ],
};

describe('parseSnapshot', () => {
  it('accepts a valid snapshot unchanged', () => {
    expect(parseSnapshot(good)).toEqual({ ok: true, value: good });
  });

  it('rejects broken top-level shapes', () => {
    expect(parseSnapshot(null).ok).toBe(false);
    expect(parseSnapshot([]).ok).toBe(false);
    expect(parseSnapshot({ ...good, generatedAt: 'yesterday' }).ok).toBe(false);
    expect(parseSnapshot({ ...good, gateway: { running: 'yes' } }).ok).toBe(false);
    expect(parseSnapshot({ ...good, agents: {} }).ok).toBe(false);
  });

  it('drops unknown fields everywhere', () => {
    const r = parseSnapshot({
      ...good,
      secret: 'x',
      gateway: { running: true, pid: 12345 },
      agents: [{ ...good.agents[0], prompt: 'do the thing', log: 'line' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).not.toHaveProperty('secret');
    expect(r.value.gateway).toEqual({ running: true });
    expect(r.value.agents[0]).not.toHaveProperty('prompt');
    expect(r.value.agents[0]).not.toHaveProperty('log');
  });

  it('skips invalid and duplicate agents but keeps the rest', () => {
    const r = parseSnapshot({
      ...good,
      agents: [
        { id: 'a', state: 'idle', activeJobs: 0 },
        { id: 'b', state: 'sleeping', activeJobs: 0 },
        { state: 'idle' },
        'nope',
        { id: 'a', state: 'error', activeJobs: 0 },
        { id: 'c', state: 'offline', activeJobs: 0 },
      ],
    });
    expect(r.ok && r.value.agents.map((a) => [a.id, a.state])).toEqual([
      ['a', 'idle'],
      ['c', 'offline'],
    ]);
  });

  it('caps the number of agents', () => {
    const agents = Array.from({ length: 200 }, (_, i) => ({ id: `a${i}`, state: 'idle', activeJobs: 0 }));
    const r = parseSnapshot({ ...good, agents });
    expect(r.ok && r.value.agents.length).toBe(LIMITS.agents);
  });
});

describe('parseAgent', () => {
  it('defaults displayName to id and sanitizes numbers', () => {
    expect(parseAgent({ id: 'x', state: 'idle', activeJobs: -3 })).toEqual({
      id: 'x',
      displayName: 'x',
      state: 'idle',
      activeJobs: 0,
    });
    expect(parseAgent({ id: 'x', state: 'idle', activeJobs: 1.5 })?.activeJobs).toBe(0);
    expect(parseAgent({ id: 'x', state: 'idle', activeJobs: 1e9 })?.activeJobs).toBe(LIMITS.activeJobs);
  });

  it('drops malformed optional fields', () => {
    const a = parseAgent({
      id: 'x',
      state: 'idle',
      activeJobs: 0,
      unknown: 'true',
      lastRun: { status: 'meh', at: '2026-01-01T00:00:00Z' },
      nextRunAt: 'soon',
      currentTask: '   ',
    });
    expect(a).toEqual({ id: 'x', displayName: 'x', state: 'idle', activeJobs: 0 });
  });

  it('keeps unknown: true', () => {
    expect(parseAgent({ id: 'x', state: 'idle', activeJobs: 0, unknown: true })?.unknown).toBe(true);
  });
});

describe('cleanText', () => {
  it('strips control characters, collapses whitespace, clamps length', () => {
    expect(cleanText('  a\u0000b\n\tc\u001b[31m  ', 50)).toBe('a b c [31m');
    expect(cleanText('x'.repeat(500), 10)).toBe('x'.repeat(10));
    expect(cleanText(42, 10)).toBeUndefined();
  });

  it('does not split surrogate pairs when clamping', () => {
    expect(cleanText('😀😀😀', 2)).toBe('😀😀');
  });
});

describe('isIsoDate', () => {
  it('accepts ISO 8601 with zone and rejects the rest', () => {
    expect(isIsoDate('2026-10-01T23:00:00+07:00')).toBe(true);
    expect(isIsoDate('2026-10-01T23:00:00.123Z')).toBe(true);
    expect(isIsoDate('2026-10-01')).toBe(false);
    expect(isIsoDate('2026-10-01T23:00:00')).toBe(false);
    expect(isIsoDate('2026-13-45T99:00:00Z')).toBe(false);
    expect(isIsoDate(1700000000)).toBe(false);
  });
});
