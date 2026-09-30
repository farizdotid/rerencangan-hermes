import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, isLoopbackHost, loadConfig, parseAgents, parsePort } from '../server/config';

let dir: string;
const example = { port: 9600, agents: [{ id: 'default' }, { id: 'writer', displayName: 'Writer' }] };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rh-config-'));
  writeFileSync(join(dir, 'config.example.json'), JSON.stringify(example));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('loadConfig', () => {
  it('falls back to config.example.json with safe defaults', () => {
    const c = loadConfig({ rootDir: dir, env: {} });
    expect(c).toEqual({
      host: '127.0.0.1',
      port: 9600,
      mode: 'demo',
      hermesBin: 'hermes',
      configFile: 'config.example.json',
      agents: [
        { id: 'default', displayName: 'default' },
        { id: 'writer', displayName: 'Writer' },
      ],
    });
  });

  it('prefers config.local.json when present', () => {
    writeFileSync(join(dir, 'config.local.json'), JSON.stringify({ port: 9700, agents: [{ id: 'mine' }] }));
    const c = loadConfig({ rootDir: dir, env: {} });
    expect(c.configFile).toBe('config.local.json');
    expect(c.port).toBe(9700);
    expect(c.agents.map((a) => a.id)).toEqual(['mine']);
  });

  it('lets environment override port and mode', () => {
    const c = loadConfig({ rootDir: dir, env: { PORT: '9123', MODE: 'real' } });
    expect(c.port).toBe(9123);
    expect(c.mode).toBe('real');
  });

  it('refuses non-loopback hosts', () => {
    for (const HOST of ['0.0.0.0', '192.168.1.10', '::', 'example.com']) {
      expect(() => loadConfig({ rootDir: dir, env: { HOST } })).toThrow(ConfigError);
    }
    expect(loadConfig({ rootDir: dir, env: { HOST: 'localhost' } }).host).toBe('localhost');
  });

  it('accepts only "hermes" or an absolute path as HERMES_BIN', () => {
    expect(loadConfig({ rootDir: dir, env: { HERMES_BIN: '/opt/hermes/bin/hermes' } }).hermesBin).toBe(
      '/opt/hermes/bin/hermes',
    );
    for (const HERMES_BIN of ['./hermes', 'bin/hermes', 'hermes --yes']) {
      expect(() => loadConfig({ rootDir: dir, env: { HERMES_BIN } })).toThrow(ConfigError);
    }
  });

  it('rejects bad mode and broken JSON', () => {
    expect(() => loadConfig({ rootDir: dir, env: { MODE: 'prod' } })).toThrow(ConfigError);
    writeFileSync(join(dir, 'config.local.json'), '{ not json');
    expect(() => loadConfig({ rootDir: dir, env: {} })).toThrow(/config.local.json/);
  });
});

describe('parseAgents', () => {
  it('rejects ids that could act as flags or break out of an argument', () => {
    for (const id of ['-p', '--help', 'a b', 'a;rm', '../x', '', 'x'.repeat(33), 'naïve']) {
      expect(() => parseAgents([{ id }], 't')).toThrow(ConfigError);
    }
    expect(parseAgents([{ id: 'my_profile-2.b' }], 't')[0]!.id).toBe('my_profile-2.b');
  });

  it('rejects duplicates, empty lists, and bad display names', () => {
    expect(() => parseAgents([{ id: 'a' }, { id: 'a' }], 't')).toThrow(/duplicated/);
    expect(() => parseAgents([], 't')).toThrow(ConfigError);
    expect(() => parseAgents([{ id: 'a', displayName: 3 }], 't')).toThrow(ConfigError);
  });
});

describe('isLoopbackHost / parsePort', () => {
  it('recognizes loopback addresses only', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.1.2.3')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('10.0.0.1')).toBe(false);
  });

  it('validates ports', () => {
    expect(parsePort('9600', 'x')).toBe(9600);
    for (const p of ['0', '70000', 'abc', '96.5', 1.5]) expect(() => parsePort(p, 'x')).toThrow(ConfigError);
  });
});
