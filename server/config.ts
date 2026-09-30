import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';

export type Mode = 'demo' | 'real';

export interface AgentConfig {
  id: string;
  displayName: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  mode: Mode;
  /** Hermes executable for real mode: "hermes" on PATH, or an absolute path. */
  hermesBin: string;
  agents: AgentConfig[];
  /** Which file the agents came from, for the startup log. */
  configFile: string;
}

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 9600;

/**
 * Profile ids end up as command-line arguments in real mode, so they are held
 * to a strict charset: letters, digits, dot, dash, underscore, max 32 chars,
 * and they must not start with a dash (it would read as a flag).
 */
export const PROFILE_ID = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,31}$/;
const MAX_AGENTS = 32;
const MAX_DISPLAY_NAME = 40;

export class ConfigError extends Error {}

/** Only loopback binds are allowed; remote access goes through an SSH tunnel. */
export function isLoopbackHost(host: string): boolean {
  if (host === 'localhost') return true;
  if (isIP(host) === 4) return host.startsWith('127.');
  if (isIP(host) === 6) return host === '::1';
  return false;
}

export function parsePort(value: unknown, source: string): number {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 65535) {
    throw new ConfigError(`${source}: port must be an integer between 1 and 65535`);
  }
  return n;
}

export function parseAgents(value: unknown, source: string): AgentConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ConfigError(`${source}: "agents" must be a non-empty array`);
  }
  if (value.length > MAX_AGENTS) throw new ConfigError(`${source}: at most ${MAX_AGENTS} agents`);
  const seen = new Set<string>();
  return value.map((entry, i) => {
    const where = `${source}: agents[${i}]`;
    if (typeof entry !== 'object' || entry === null) throw new ConfigError(`${where} must be an object`);
    const { id, displayName } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !PROFILE_ID.test(id)) {
      throw new ConfigError(`${where}.id must match ${PROFILE_ID}`);
    }
    if (seen.has(id)) throw new ConfigError(`${where}.id "${id}" is duplicated`);
    seen.add(id);
    let name = id;
    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.trim() === '') {
        throw new ConfigError(`${where}.displayName must be a non-empty string`);
      }
      name = displayName.trim().slice(0, MAX_DISPLAY_NAME);
    }
    return { id, displayName: name };
  });
}

interface FileConfig {
  port?: number;
  agents: AgentConfig[];
}

function readConfigFile(path: string, label: string): FileConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${label}: cannot read JSON (${(err as Error).message})`);
  }
  if (typeof raw !== 'object' || raw === null) throw new ConfigError(`${label}: must be a JSON object`);
  const obj = raw as Record<string, unknown>;
  const out: FileConfig = { agents: parseAgents(obj.agents, label) };
  if (obj.port !== undefined) out.port = parsePort(obj.port, label);
  return out;
}

export interface LoadOptions {
  env?: NodeJS.ProcessEnv;
  rootDir: string;
}

/**
 * Resolution order: environment (HOST, PORT, MODE) > config.local.json >
 * config.example.json > built-in defaults. config.local.json is git-ignored.
 */
export function loadConfig({ env = process.env, rootDir }: LoadOptions): ServerConfig {
  const localPath = resolve(rootDir, 'config.local.json');
  const examplePath = resolve(rootDir, 'config.example.json');
  const useLocal = existsSync(localPath);
  const label = useLocal ? 'config.local.json' : 'config.example.json';
  const file = readConfigFile(useLocal ? localPath : examplePath, label);

  const host = env.HOST?.trim() || DEFAULT_HOST;
  if (!isLoopbackHost(host)) {
    throw new ConfigError(
      `HOST=${host} is not a loopback address. Bind to 127.0.0.1 and use an SSH tunnel for remote access.`,
    );
  }

  const port = env.PORT ? parsePort(env.PORT, 'PORT') : (file.port ?? DEFAULT_PORT);

  const modeRaw = env.MODE?.trim() || 'demo';
  if (modeRaw !== 'demo' && modeRaw !== 'real') throw new ConfigError(`MODE must be "demo" or "real"`);

  const hermesBin = env.HERMES_BIN?.trim() || 'hermes';
  if (hermesBin !== 'hermes' && !isAbsolute(hermesBin)) {
    throw new ConfigError('HERMES_BIN must be an absolute path to the hermes executable');
  }

  return { host, port, mode: modeRaw, hermesBin, agents: file.agents, configFile: label };
}
