import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { childEnv, runHermes } from '../server/sources/hermesCli';

let dir: string;
let bin: string;

// A stand-in for the hermes executable. It behaves according to the profile it gets.
const FAKE = `#!/usr/bin/env node
const args = process.argv.slice(2);
const profile = args[0] === '-p' ? args[1] : null;
if (profile === 'slow') setTimeout(() => {}, 60_000);
else if (profile === 'big') process.stdout.write('x'.repeat(2 * 1024 * 1024));
else if (profile === 'fail') { process.stderr.write('/private/path secret log line'); process.exit(3); }
else if (profile === 'prompt') { process.stdin.resume(); process.stdin.on('end', () => console.log('stdin-closed')); }
else console.log(JSON.stringify({ args, env: Object.keys(process.env).sort() }));
`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rh-cli-'));
  bin = join(dir, 'hermes');
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o755);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const env = { PATH: process.env.PATH, HOME: '/home/someone', AWS_SECRET_ACCESS_KEY: 'x', GITHUB_TOKEN: 'y' };

describe('runHermes', () => {
  it('runs the allowlisted args without a shell and with a minimal env', async () => {
    const r = await runHermes('cron-list', 'writer', { bin, env });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = JSON.parse(r.stdout) as { args: string[]; env: string[] };
    expect(out.args).toEqual(['-p', 'writer', 'cron', 'list']);
    expect(out.env).not.toContain('AWS_SECRET_ACCESS_KEY');
    expect(out.env).not.toContain('GITHUB_TOKEN');
    expect(out.env).toEqual(expect.arrayContaining(['HOME', 'PATH', 'NO_COLOR', 'TERM']));
  });

  it('kills a command that runs too long', async () => {
    const start = Date.now();
    expect(await runHermes('cron-list', 'slow', { bin, env, timeoutMs: 300 })).toEqual({ ok: false, reason: 'timeout' });
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('kills a command whose output is too large', async () => {
    expect(await runHermes('cron-list', 'big', { bin, env, maxBytes: 64 * 1024 })).toEqual({ ok: false, reason: 'too-large' });
  });

  it('reports exit codes but never stderr', async () => {
    const r = await runHermes('cron-list', 'fail', { bin, env });
    expect(r).toEqual({ ok: false, reason: 'exit', exitCode: 3 });
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('closes stdin so an interactive prompt cannot hang', async () => {
    const r = await runHermes('cron-list', 'prompt', { bin, env, timeoutMs: 3000 });
    expect(r).toEqual({ ok: true, stdout: 'stdin-closed\n' });
  });

  it('reports a missing executable', async () => {
    expect(await runHermes('cron-status', null, { bin: join(dir, 'nope'), env })).toEqual({ ok: false, reason: 'not-found' });
  });

  it('can be aborted', async () => {
    const ac = new AbortController();
    const p = runHermes('cron-list', 'slow', { bin, env, signal: ac.signal, timeoutMs: 30_000 });
    setTimeout(() => ac.abort(), 50);
    expect(await p).toEqual({ ok: false, reason: 'aborted' });
  });

  it('refuses non-allowlisted input before spawning anything', () => {
    expect(() => runHermes('cron-list', '--help', { bin, env })).toThrow();
  });
});

describe('childEnv', () => {
  it('passes only allowlisted variables plus output settings', () => {
    expect(childEnv({ PATH: '/bin', SECRET: 'x', LANG: 'C.UTF-8' })).toEqual({
      PATH: '/bin',
      LANG: 'C.UTF-8',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TERM: 'dumb',
      COLUMNS: '200',
      PYTHONIOENCODING: 'utf-8',
    });
  });
});
