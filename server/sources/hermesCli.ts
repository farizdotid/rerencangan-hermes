import { execFile, type ExecFileException } from 'node:child_process';
import { buildArgs, type CommandKey } from './allowlist';

export type CliFailure = 'not-found' | 'timeout' | 'too-large' | 'exit' | 'aborted' | 'error';

/** stdout only on success. stderr is never kept: it may hold paths or log lines. */
export type CliResult = { ok: true; stdout: string } | { ok: false; reason: CliFailure; exitCode?: number };

export interface RunOptions {
  /** "hermes" (looked up on PATH) or an absolute path. */
  bin?: string;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  /** Source environment to copy the allowlisted variables from. */
  env?: NodeJS.ProcessEnv;
}

export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_MAX_BYTES = 512 * 1024;

/**
 * Variables passed to the child. Everything else (tokens, keys, cloud creds
 * in the server's own environment) stays out of the Hermes process.
 */
const PASS_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ'];

export function childEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const k of PASS_ENV) if (source[k] !== undefined) env[k] = source[k];
  // Plain, wide, uncolored output is easier to parse.
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  env.TERM = 'dumb';
  env.COLUMNS = '200';
  env.PYTHONIOENCODING = 'utf-8';
  return env;
}

function classify(err: ExecFileException & { code?: unknown }): CliResult {
  if (err.name === 'AbortError' || err.code === 'ABORT_ERR') return { ok: false, reason: 'aborted' };
  if (err.code === 'ENOENT') return { ok: false, reason: 'not-found' };
  if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return { ok: false, reason: 'too-large' };
  if (err.killed) return { ok: false, reason: 'timeout' };
  if (typeof err.code === 'number') return { ok: false, reason: 'exit', exitCode: err.code };
  return { ok: false, reason: 'error' };
}

/**
 * Runs one allowlisted, read-only Hermes command. No shell is involved, stdin
 * is closed immediately (so an interactive prompt cannot hang the collector),
 * and the process is killed on timeout or when the output gets too large.
 */
export function runHermes(key: CommandKey, profile: string | null, opts: RunOptions = {}): Promise<CliResult> {
  const args = buildArgs(key, profile);
  return new Promise((resolve) => {
    const child = execFile(
      opts.bin ?? 'hermes',
      args,
      {
        shell: false,
        encoding: 'utf8',
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: opts.maxBytes ?? DEFAULT_MAX_BYTES,
        killSignal: 'SIGKILL',
        windowsHide: true,
        env: childEnv(opts.env ?? process.env),
        ...(opts.signal ? { signal: opts.signal } : {}),
      },
      (err, stdout) => resolve(err ? classify(err) : { ok: true, stdout }),
    );
    child.stdin?.end();
  });
}
