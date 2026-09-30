import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCronList, parseExecution } from '../server/sources/parse/cronList';
import { parseCronStatus } from '../server/sources/parse/cronStatus';
import { findIso, parseAgo, toLines } from '../server/sources/parse/text';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../server/sources/fixtures', name), 'utf8');

describe('parseCronStatus with the appendix A fixture', () => {
  it('reads gateway state, heartbeat, job count, next run, and profiles', () => {
    expect(parseCronStatus(fixture('cron-status.running.txt'))).toEqual({
      recognized: true,
      gatewayRunning: true,
      heartbeatAgeSeconds: 9,
      activeJobs: 1,
      nextRunAt: '2026-10-01T23:00:00+07:00',
      servedProfiles: ['default', 'writer', 'research'],
    });
  });

  it('never keeps the PID', () => {
    expect(JSON.stringify(parseCronStatus(fixture('cron-status.running.txt')))).not.toContain('12345');
  });
});

describe('parseCronList with the appendix A fixture', () => {
  it('reads the profile and the running job', () => {
    expect(parseCronList(fixture('cron-list.running.txt'))).toEqual({
      recognized: true,
      profile: 'default',
      jobs: [
        {
          id: 'a1b2c3d4e5f6',
          status: 'active',
          name: 'Daily article job',
          nextRunAt: '2026-10-01T23:00:00+07:00',
          overdue: false,
          execution: { state: 'running' },
        },
      ],
    });
  });

  it('does not keep the execution id', () => {
    expect(JSON.stringify(parseCronList(fixture('cron-list.running.txt')))).not.toContain('0123456789abcdef');
  });
});

// The inputs below are synthetic, built to exercise defensive parsing. They are
// not claims about real Hermes output; real fixtures replace them over time.
describe('defensive parsing (synthetic input)', () => {
  it('survives colors, CRLF line endings, and tabs', () => {
    const colored = fixture('cron-status.running.txt')
      .replace('Gateway is running', '\u001b[32mGateway is running\u001b[0m')
      .replace(/\n/g, '\r\n');
    expect(parseCronStatus(colored).gatewayRunning).toBe(true);
    const list = parseCronList(fixture('cron-list.running.txt').replace(/\n/g, '\r\n').replace('Name:', '\u001b[1mName:\u001b[0m'));
    expect(list.jobs[0]!.name).toBe('Daily article job');
  });

  it('marks unrelated or empty output as not recognized, without throwing', () => {
    for (const raw of ['', '\n\n', 'Traceback (most recent call last):\n  File "x"', '{"json":true}', '\u0000\u0001\u0002']) {
      expect(parseCronStatus(raw)).toEqual({ recognized: false, gatewayRunning: null });
      expect(parseCronList(raw)).toEqual({ recognized: false, jobs: [] });
    }
  });

  it('handles huge input without blowing up', () => {
    const raw = 'x'.repeat(5_000_000);
    expect(parseCronList(raw).recognized).toBe(false);
  });

  it('ignores unknown fields and keeps known ones in any order', () => {
    const raw = [
      'Scheduled Jobs (profile: writer)',
      'abcd1234 [active]',
      '  Execution: running  ffff',
      '  Mood:      cheerful',
      '  Name:      Job one',
      'efgh5678 [paused]',
      '  Next run:  2026-10-02T08:00:00Z',
    ].join('\n');
    const list = parseCronList(raw);
    expect(list.profile).toBe('writer');
    expect(list.jobs.map((j) => [j.id, j.status, j.name, j.execution?.state])).toEqual([
      ['abcd1234', 'active', 'Job one', 'running'],
      ['efgh5678', 'paused', undefined, undefined],
    ]);
  });

  it('flags overdue jobs wherever the word appears', () => {
    const raw = ['a1b2c3d4 [active]', '  Dispatch:  OVERDUE by 5m', 'b1b2c3d4 [overdue]', 'c1b2c3d4 [active]', '  Next run:  2026-10-01T23:00:00+07:00 (overdue)'].join('\n');
    expect(parseCronList(raw).jobs.map((j) => j.overdue)).toEqual([true, true, true]);
  });

  it('strips control characters from job names and clamps their length', () => {
    const raw = `a1b2c3d4 [active]\n  Name: ${'N'.repeat(300)}\u0007`;
    const name = parseCronList(raw).jobs[0]!.name!;
    expect(name).toHaveLength(120);
    expect(name).not.toContain('\u0007');
  });

  it('only accepts well-formed profile names from "serving profiles"', () => {
    const raw = 'Gateway is running\nserving profiles default, -p, $(rm -rf), ok_2';
    expect(parseCronStatus(raw).servedProfiles).toEqual(['default', 'ok_2']);
  });

  it('reads an explicit "not running" line as a stopped gateway (assumed wording)', () => {
    expect(parseCronStatus('✗ Gateway is not running').gatewayRunning).toBe(false);
  });
});

describe('parseExecution', () => {
  it('maps the first word, keeping an ISO time when present', () => {
    expect(parseExecution('running  0123')).toEqual({ state: 'running' });
    expect(parseExecution('failed at 2026-10-01T23:05:00+07:00')).toEqual({
      state: 'failed',
      at: '2026-10-01T23:05:00+07:00',
    });
    expect(parseExecution('success')).toEqual({ state: 'success' });
    expect(parseExecution('')).toEqual({ state: 'none' });
    expect(parseExecution('wibble')).toEqual({ state: 'unknown' });
  });
});

describe('text helpers', () => {
  it('parseAgo', () => {
    expect(parseAgo('9s ago')).toBe(9);
    expect(parseAgo('2m 5s ago')).toBe(125);
    expect(parseAgo('1h ago')).toBe(3600);
    expect(parseAgo('just now')).toBe(0);
    expect(parseAgo('a while ago')).toBeUndefined();
  });

  it('findIso requires a zone and a real date', () => {
    expect(findIso('at 2026-10-01T23:00:00+07:00 sharp')).toBe('2026-10-01T23:00:00+07:00');
    expect(findIso('2026-10-01T23:00:00')).toBeUndefined();
    expect(findIso('2026-19-01T23:00:00Z')).toBeUndefined();
  });

  it('toLines removes box drawing and blank lines', () => {
    expect(toLines('┌──┐\n│ hi │\n└──┘\n\n')).toEqual(['hi']);
  });
});
