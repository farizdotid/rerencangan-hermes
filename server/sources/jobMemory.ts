import type { RunStatus } from '../../src/data/types';
import type { CronList, ExecutionState } from './parse/cronList';

interface JobRecord {
  lastState: ExecutionState;
  lastRun?: { status: RunStatus; at: string };
}

export interface ProfileSummary {
  runningJob?: string;
  lastRun?: { status: RunStatus; at: string };
  nextRunAt?: string;
  activeJobs: number;
}

/**
 * Remembers job executions between polls, so a finish time is known even
 * when the CLI does not print one: a run that turns into success/failed is
 * stamped with the poll time at which the change was first seen.
 *
 * On the very first poll a failure without timestamp is stamped "now" (so it
 * shows as error for the error window), while an old success is not
 * celebrated.
 */
export class JobMemory {
  private readonly jobs = new Map<string, JobRecord>();
  private seenOnce = false;

  update(list: CronList, now: number): ProfileSummary {
    const nowIso = new Date(now).toISOString();
    const summary: ProfileSummary = { activeJobs: 0 };
    const present = new Set<string>();

    for (const job of list.jobs) {
      present.add(job.id);
      const exec = job.execution ?? { state: 'none' as const };
      const prev = this.jobs.get(job.id);
      const rec: JobRecord = prev ?? { lastState: 'none' };

      if (job.lastRun) {
        // The CLI says when the last run finished; that beats our own guess.
        rec.lastRun = job.lastRun;
      } else if (exec.state === 'success' || exec.state === 'failed') {
        const changed = !prev || prev.lastState !== exec.state;
        if (exec.at) {
          rec.lastRun = { status: exec.state, at: exec.at };
        } else if (changed && (this.seenOnce || exec.state === 'failed')) {
          rec.lastRun = { status: exec.state, at: nowIso };
        }
      }
      rec.lastState = exec.state;
      this.jobs.set(job.id, rec);

      if (job.status === 'active') summary.activeJobs++;
      if (exec.state === 'running' && summary.runningJob === undefined) summary.runningJob = job.name ?? '';
      if (job.nextRunAt && (!summary.nextRunAt || Date.parse(job.nextRunAt) < Date.parse(summary.nextRunAt))) {
        summary.nextRunAt = job.nextRunAt;
      }
      if (rec.lastRun && (!summary.lastRun || Date.parse(rec.lastRun.at) > Date.parse(summary.lastRun.at))) {
        summary.lastRun = rec.lastRun;
      }
    }

    // Forget jobs that no longer exist, so the map cannot grow without bound.
    for (const id of this.jobs.keys()) if (!present.has(id)) this.jobs.delete(id);
    this.seenOnce = true;
    return summary;
  }
}
