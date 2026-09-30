import { describe, expect, it } from 'vitest';
import { JobMemory } from '../server/sources/jobMemory';
import type { CronJob, CronList } from '../server/sources/parse/cronList';

const T0 = Date.parse('2026-10-01T12:00:00Z');
const list = (...jobs: Partial<CronJob>[]): CronList => ({
  recognized: true,
  jobs: jobs.map((j, i) => ({ id: `job${i}aaaa`, status: 'active', overdue: false, ...j })),
});

describe('JobMemory', () => {
  it('reports the running job, active count, and earliest next run', () => {
    const m = new JobMemory();
    const s = m.update(
      list(
        { name: 'A', execution: { state: 'running' }, nextRunAt: '2026-10-02T00:00:00Z' },
        { name: 'B', status: 'paused', nextRunAt: '2026-10-01T20:00:00Z' },
      ),
      T0,
    );
    expect(s).toEqual({ runningJob: 'A', activeJobs: 1, nextRunAt: '2026-10-01T20:00:00Z' });
  });

  it('stamps a finish with the poll time when the CLI gives none', () => {
    const m = new JobMemory();
    m.update(list({ execution: { state: 'running' } }), T0);
    const s = m.update(list({ execution: { state: 'success' } }), T0 + 7000);
    expect(s.lastRun).toEqual({ status: 'success', at: new Date(T0 + 7000).toISOString() });
    // Unchanged on later polls.
    expect(m.update(list({ execution: { state: 'success' } }), T0 + 14000).lastRun?.at).toBe(new Date(T0 + 7000).toISOString());
  });

  it('prefers a timestamp printed by the CLI', () => {
    const m = new JobMemory();
    const s = m.update(list({ execution: { state: 'failed', at: '2026-10-01T11:58:00Z' } }), T0);
    expect(s.lastRun).toEqual({ status: 'failed', at: '2026-10-01T11:58:00Z' });
  });

  it('on the first poll: shows an untimed failure, but does not celebrate an old success', () => {
    expect(new JobMemory().update(list({ execution: { state: 'failed' } }), T0).lastRun?.status).toBe('failed');
    expect(new JobMemory().update(list({ execution: { state: 'success' } }), T0).lastRun).toBeUndefined();
  });

  it('picks the most recent run across jobs and forgets removed jobs', () => {
    const m = new JobMemory();
    const s = m.update(
      list({ execution: { state: 'failed', at: '2026-10-01T10:00:00Z' } }, { execution: { state: 'success', at: '2026-10-01T11:00:00Z' } }),
      T0,
    );
    expect(s.lastRun?.status).toBe('success');
    expect(m.update(list(), T0 + 1000)).toEqual({ activeJobs: 0 });
  });
});
