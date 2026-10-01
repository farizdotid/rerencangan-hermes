import { describe, expect, it } from 'vitest';
import type { AgentStatus } from '../src/data/types';
import { describeAgent, type DescribeContext } from '../src/ui/describe';

const NOW = Date.parse('2026-10-01T05:00:00Z');
const ctx = (over: Partial<DescribeContext> = {}): DescribeContext => ({
  shownState: 'working',
  gatewayRunning: true,
  stale: false,
  now: NOW,
  timeZone: 'Asia/Jakarta',
  ...over,
});
const agent: AgentStatus = {
  id: 'writer',
  displayName: 'Writer',
  state: 'working',
  currentTask: 'Daily article job',
  lastRun: { status: 'failed', at: '2026-10-01T04:55:00Z' },
  nextRunAt: '2026-10-01T23:00:00+07:00',
  activeJobs: 2,
};

describe('describeAgent', () => {
  it('lists task, last run, next run, and job count', () => {
    const d = describeAgent(agent, ctx());
    expect(d.title).toBe('Writer');
    expect(d.stateLabel).toBe('Bekerja');
    expect(d.rows).toEqual([
      { label: 'Tugas sekarang', value: 'Daily article job' },
      { label: 'Run terakhir', value: 'Gagal · 5 mnt lalu (11.55)' },
      { label: 'Jadwal berikutnya', value: '23.00 · dalam 11 jam' },
      { label: 'Job aktif', value: '2' },
    ]);
    expect(d.note).toBeUndefined();
  });

  it('hides the current task unless the agent is shown working', () => {
    const d = describeAgent(agent, ctx({ shownState: 'offline', gatewayRunning: false }));
    expect(d.rows.map((r) => r.label)).not.toContain('Tugas sekarang');
    expect(d.stateLabel).toBe('Offline');
    expect(d.note).toBe('Gateway tidak berjalan.');
  });

  it('says "Tidur" for an idle agent napping in bed', () => {
    expect(describeAgent(agent, ctx({ shownState: 'idle', sleeping: true })).stateLabel).toBe('Tidur');
    expect(describeAgent(agent, ctx({ shownState: 'offline', sleeping: true })).stateLabel).toBe('Offline');
  });

  it('uses dashes for missing times', () => {
    const d = describeAgent({ id: 'x', displayName: 'x', state: 'idle', activeJobs: 0 }, ctx({ shownState: 'idle' }));
    expect(d.rows).toEqual([
      { label: 'Run terakhir', value: '—' },
      { label: 'Jadwal berikutnya', value: '—' },
      { label: 'Job aktif', value: '0' },
    ]);
  });

  it('explains stale data first, then gateway, then unknown output', () => {
    expect(describeAgent({ ...agent, unknown: true }, ctx({ stale: true })).note).toMatch(/terputus/);
    expect(describeAgent({ ...agent, unknown: true }, ctx({ gatewayRunning: false })).note).toMatch(/Gateway/);
    expect(describeAgent({ ...agent, unknown: true }, ctx()).note).toMatch(/tidak dikenali/);
  });
});
