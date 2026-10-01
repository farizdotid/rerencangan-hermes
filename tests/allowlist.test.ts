import { describe, expect, it } from 'vitest';
import { AllowlistError, COMMANDS, buildArgs, type CommandKey } from '../server/sources/allowlist';

describe('allowlist', () => {
  it('contains only the read-only commands from the PRD', () => {
    expect(Object.values(COMMANDS).map((c) => c.args.join(' '))).toEqual([
      'profile list',
      'cron status',
      'cron list',
      'sessions list',
    ]);
  });

  it('builds fixed argument lists', () => {
    expect(buildArgs('cron-status', null)).toEqual(['cron', 'status']);
    expect(buildArgs('cron-list', 'writer')).toEqual(['-p', 'writer', 'cron', 'list']);
  });

  it('rejects unknown commands, including prototype keys', () => {
    for (const k of ['cron-run', 'toString', '__proto__', 'constructor']) {
      expect(() => buildArgs(k as CommandKey, null)).toThrow(AllowlistError);
    }
  });

  it('rejects missing or malicious profile ids', () => {
    for (const p of [null, '', '-rf', '--config=/etc/passwd', 'a b', 'x;y', '$(id)', '../../etc']) {
      expect(() => buildArgs('cron-list', p)).toThrow(AllowlistError);
    }
    expect(() => buildArgs('cron-status', 'writer')).toThrow(AllowlistError);
  });

  it('returns a fresh array every time', () => {
    const a = buildArgs('cron-status', null);
    a.push('--oops');
    expect(buildArgs('cron-status', null)).toEqual(['cron', 'status']);
  });
});
