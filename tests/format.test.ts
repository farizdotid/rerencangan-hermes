import { describe, expect, it } from 'vitest';
import { STATE_LABELS, STATE_ORDER, formatAgo, formatClock, formatUntil } from '../src/ui/format';
import { AGENT_STATES } from '../src/data/types';

const TZ = 'Asia/Jakarta';
const NOW = Date.parse('2026-10-01T05:00:00Z'); // 12.00 in Jakarta

describe('formatAgo', () => {
  it('uses short Indonesian units', () => {
    expect(formatAgo(0)).toBe('baru saja');
    expect(formatAgo(4_999)).toBe('baru saja');
    expect(formatAgo(12_000)).toBe('12 dtk lalu');
    expect(formatAgo(5 * 60_000 + 30_000)).toBe('5 mnt lalu');
    expect(formatAgo(2 * 3_600_000)).toBe('2 jam lalu');
    expect(formatAgo(3 * 86_400_000)).toBe('3 hari lalu');
  });

  it('treats negative or invalid spans as "baru saja"', () => {
    expect(formatAgo(-10_000)).toBe('baru saja');
    expect(formatAgo(Number.NaN)).toBe('baru saja');
  });
});

describe('formatUntil', () => {
  it('handles future, now, and overdue', () => {
    expect(formatUntil(5 * 60_000)).toBe('dalam 5 mnt');
    expect(formatUntil(11 * 3_600_000)).toBe('dalam 11 jam');
    expect(formatUntil(10_000)).toBe('sekarang');
    expect(formatUntil(-3 * 60_000)).toBe('terlambat 3 mnt');
  });
});

describe('formatClock', () => {
  it('shows only the time for today, and names tomorrow and yesterday', () => {
    expect(formatClock('2026-10-01T23:00:00+07:00', NOW, TZ)).toBe('23.00');
    expect(formatClock('2026-10-02T07:30:00+07:00', NOW, TZ)).toBe('besok 07.30');
    expect(formatClock('2026-09-30T23:00:00+07:00', NOW, TZ)).toBe('kemarin 23.00');
  });

  it('adds the date further out, in the viewer time zone', () => {
    expect(formatClock('2026-10-05T16:00:00Z', NOW, TZ)).toBe('5 Okt 23.00');
    // Same instant, another zone: day boundaries move with it.
    expect(formatClock('2026-10-01T23:00:00+07:00', NOW, 'UTC')).toBe('16.00');
  });

  it('returns a dash for invalid input', () => {
    expect(formatClock('soon', NOW, TZ)).toBe('—');
  });
});

describe('labels', () => {
  it('has a label and an order slot for every state', () => {
    expect(Object.keys(STATE_LABELS).sort()).toEqual([...AGENT_STATES].sort());
    expect([...STATE_ORDER].sort()).toEqual([...AGENT_STATES].sort());
  });
});
