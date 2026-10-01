import type { AgentState, AgentStatus } from '../data/types';
import { STATE_LABELS, formatAgo, formatClock, formatUntil } from './format';

export interface AgentDescription {
  title: string;
  state: AgentState;
  stateLabel: string;
  rows: { label: string; value: string }[];
  note?: string;
}

export interface DescribeContext {
  /** State actually shown (may be offline because of the gateway or a lost connection). */
  shownState: AgentState;
  gatewayRunning: boolean;
  stale: boolean;
  now: number;
  timeZone?: string;
  /** The avatar is napping in its bed. */
  sleeping?: boolean;
}

/**
 * Text for the info panel. Only contract fields are used: names, state, job
 * name, times, and counts. Never any prompt, session, or log text.
 */
export function describeAgent(agent: AgentStatus, ctx: DescribeContext): AgentDescription {
  const rows: { label: string; value: string }[] = [];

  if (ctx.shownState === 'working' && agent.currentTask) rows.push({ label: 'Tugas sekarang', value: agent.currentTask });

  if (agent.lastRun) {
    const result = agent.lastRun.status === 'success' ? 'Sukses' : 'Gagal';
    const when = formatAgo(ctx.now - Date.parse(agent.lastRun.at));
    rows.push({ label: 'Run terakhir', value: `${result} · ${when} (${formatClock(agent.lastRun.at, ctx.now, ctx.timeZone)})` });
  } else {
    rows.push({ label: 'Run terakhir', value: '—' });
  }

  if (agent.nextRunAt) {
    const until = formatUntil(Date.parse(agent.nextRunAt) - ctx.now);
    rows.push({ label: 'Jadwal berikutnya', value: `${formatClock(agent.nextRunAt, ctx.now, ctx.timeZone)} · ${until}` });
  } else {
    rows.push({ label: 'Jadwal berikutnya', value: '—' });
  }

  rows.push({ label: 'Job aktif', value: String(agent.activeJobs) });

  const desc: AgentDescription = {
    title: agent.displayName,
    state: ctx.shownState,
    stateLabel: ctx.sleeping && ctx.shownState === 'idle' ? 'Tidur' : STATE_LABELS[ctx.shownState],
    rows,
  };
  if (ctx.stale) desc.note = 'Koneksi ke server terputus; data mungkin sudah usang.';
  else if (!ctx.gatewayRunning) desc.note = 'Gateway tidak berjalan.';
  else if (agent.unknown) desc.note = 'Output Hermes tidak dikenali; status mungkin tidak akurat.';
  return desc;
}
