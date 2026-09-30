import { PROFILE_ID } from '../config';

/**
 * The only Hermes commands this app may run (PRD section 6). All of them are
 * read-only. Arguments are fixed here; nothing from the network or the
 * browser ever becomes an argument, and profile ids are validated again.
 */
export const COMMANDS = {
  'cron-status': { args: ['cron', 'status'], perProfile: false },
  'cron-list': { args: ['cron', 'list'], perProfile: true },
  'sessions-list': { args: ['sessions', 'list'], perProfile: true },
} as const satisfies Record<string, { args: readonly string[]; perProfile: boolean }>;

export type CommandKey = keyof typeof COMMANDS;

/**
 * Whether the argument layout below has been checked against `hermes --help`
 * on the target machine. Real mode refuses to start while this is false.
 *
 * UNVERIFIED: the PRD says other profiles use `-p <name>`, but not whether
 * the flag goes before the subcommand (`hermes -p x cron list`) or after it
 * (`hermes cron list -p x`). The layout below is a placeholder.
 */
export const CLI_SYNTAX_VERIFIED = false;

export class AllowlistError extends Error {}

export function buildArgs(key: CommandKey, profile: string | null): string[] {
  if (!Object.hasOwn(COMMANDS, key)) throw new AllowlistError(`command "${String(key)}" is not allowlisted`);
  const cmd = COMMANDS[key];
  if (!cmd.perProfile) {
    if (profile !== null) throw new AllowlistError(`"${key}" does not take a profile`);
    return [...cmd.args];
  }
  if (profile === null || !PROFILE_ID.test(profile)) {
    throw new AllowlistError(`"${key}" needs a valid profile id`);
  }
  // UNVERIFIED placement, see CLI_SYNTAX_VERIFIED.
  return ['-p', profile, ...cmd.args];
}
