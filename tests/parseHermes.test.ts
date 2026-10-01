import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCronList, parseLastRun } from '../server/sources/parse/cronList';
import { parseProfileList } from '../server/sources/parse/profileList';
import { mostRecentActivity, parseSessionsList } from '../server/sources/parse/sessionsList';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../server/sources/fixtures', name), 'utf8');

describe('parseProfileList', () => {
  it('reads ids, the default marker, and per-profile gateway state from the real fixture', () => {
    expect(parseProfileList(fixture('profile-list.txt'))).toEqual({
      recognized: true,
      profiles: [
        { id: 'default', active: true, gatewayRunning: true },
        { id: 'writer', active: false, gatewayRunning: true },
        { id: 'research', active: false, gatewayRunning: true },
        { id: 'planner', active: false, gatewayRunning: true },
      ],
    });
  });

  it('does not keep the model or alias columns', () => {
    expect(JSON.stringify(parseProfileList(fixture('profile-list.txt')))).not.toContain('provider/model-a');
  });

  // Synthetic: stopped gateways and messy rows.
  it('reads stopped or empty gateway columns, and skips invalid ids', () => {
    const raw = [
      ' Profile   Model   Gateway   Alias   Distribution',
      ' ───────   ─────   ───────   ─────   ────────────',
      ' ◆default   m   stopped   —   —',
      '  other   m   —   —   —',
      '  -bad   m   running   —   —',
      '  default   m   running   —   —',
    ].join('\n');
    expect(parseProfileList(raw).profiles).toEqual([
      { id: 'default', active: true, gatewayRunning: false },
      { id: 'other', active: false, gatewayRunning: null },
    ]);
  });

  it('marks unrelated output as not recognized', () => {
    for (const raw of ['', 'usage: hermes profile ...', 'Error: no profiles']) {
      expect(parseProfileList(raw)).toEqual({ recognized: false, profiles: [] });
    }
  });
});

describe('parseSessionsList', () => {
  it('reads how long ago each session was active, and which came from cron', () => {
    const list = parseSessionsList(fixture('sessions-list.txt'));
    expect(list.recognized).toBe(true);
    expect(list.sessions).toHaveLength(11);
    expect(list.sessions[0]).toEqual({ kind: 'chat', lastActiveSeconds: 7 * 3600 });
    expect(list.sessions[1]).toEqual({ kind: 'cron', lastActiveSeconds: 8 * 3600 });
    expect(list.sessions[3]).toEqual({ kind: 'chat', lastActiveSeconds: 50 * 60 });
    expect(list.sessions[4]).toEqual({ kind: 'chat', lastActiveSeconds: 86_400 });
    expect(mostRecentActivity(list)).toBe(50 * 60);
  });

  it('never keeps titles, workspaces, or ids', () => {
    const json = JSON.stringify(parseSessionsList(fixture('sessions-list.txt')));
    for (const s of ['Chat session', 'Daily article', 'home', '20260101', 'cron_b2c3', '[/cmd]']) {
      expect(json).not.toContain(s);
    }
  });

  // Synthetic: other relative-time spellings.
  it('understands other relative times', () => {
    const raw = [
      'Title   Workspace   Last Active   ID',
      'a   w   just now   x1',
      'b   w   30s ago   x2',
      'c   w   2m ago   x3',
      'd   w   3 days ago   x4',
      'e   w   2w ago   x5',
      'f   w   last month   x6',
    ].join('\n');
    expect(parseSessionsList(raw).sessions.map((s) => s.lastActiveSeconds)).toEqual([0, 30, 120, 3 * 86_400, 14 * 86_400]);
  });

  it('handles an empty list and unrelated output', () => {
    expect(parseSessionsList('No sessions found.')).toEqual({ recognized: true, sessions: [] });
    expect(parseSessionsList('Traceback...')).toEqual({ recognized: false, sessions: [] });
    expect(mostRecentActivity({ recognized: true, sessions: [] })).toBeNull();
  });
});

describe('cron list with a finished job (real fixture)', () => {
  it('reads "Last run" and the completed execution', () => {
    const list = parseCronList(fixture('cron-list.completed.txt'));
    expect(list.recognized).toBe(true);
    expect(list.jobs[0]).toMatchObject({
      id: 'b2c3d4e5f6a1',
      name: 'Daily article job',
      nextRunAt: '2026-10-01T23:00:00+07:00',
      execution: { state: 'success' },
      lastRun: { status: 'success', at: '2026-10-01T00:40:00.123456+07:00' },
    });
  });

  it('parseLastRun maps results and needs a timestamp', () => {
    expect(parseLastRun('2026-10-01T00:40:00+07:00  ok')).toEqual({ status: 'success', at: '2026-10-01T00:40:00+07:00' });
    expect(parseLastRun('2026-10-01T00:40:00+07:00  error')).toEqual({ status: 'failed', at: '2026-10-01T00:40:00+07:00' });
    expect(parseLastRun('2026-10-01T00:40:00+07:00  ???')).toBeUndefined();
    expect(parseLastRun('never')).toBeUndefined();
  });
});
