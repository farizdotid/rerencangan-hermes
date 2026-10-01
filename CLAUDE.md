# CLAUDE.md

Rerencangan Hermes is a 3D virtual office (Three.js) that shows the status of
Hermes Agent profiles. See [`README.md`](./README.md) for how it runs and its
security model. The rules below are not negotiable; if a change would break
one, stop and ask the owner.

## Safety

- The collector is read-only. Never write to the Hermes data directory and
  never run a Hermes command that changes state.
- Only commands in `server/sources/allowlist.ts` run, via `execFile` (no shell),
  with a timeout, an output limit, stdin closed, and a minimal environment.
  Before adding a command, confirm it is read-only from `hermes <cmd> --help`
  on the target machine; never guess flags or syntax.
- Never read `~/.hermes/.env`, `config.yaml`, credentials, SSH keys, or `state.db`.
- The browser gets status and numbers only: state, job name, times, counts.
  No prompt, session, or log text. Session titles are dropped in the parser.
- Treat CLI output as untrusted: parse defensively, never evaluate it.
  Unrecognized output shows the agent `idle` with `unknown: true`, never a crash.
  Mark wording that is assumed rather than seen in a real fixture.
- The server binds to loopback only; remote access goes through an SSH tunnel.

## Public by default

- Treat every commit as public: no secrets, IPs, hostnames, private paths, or
  real profile, job, or project names, in code, tests, fixtures, or docs.
  Private settings live in `config.local.json` (git-ignored); commit only
  `config.example.json` with generic values (`default`, `writer`, `research`).
- Fixtures from a real machine must be sanitized first: PIDs, job and
  execution ids, session ids and titles, job names, profile names, models,
  and hostnames replaced with generic values.
- Pin exact dependency versions. No telemetry, no runtime CDN. Assets are
  made in code or clearly licensed, and listed in `ASSETS.md`.
- Never change repository visibility.

## Working

- Ask before making product decisions; give a short plan, then do the work.
- Run `npm run build`, `npm run typecheck`, and `npm test` before reporting done,
  and say plainly what could not be verified.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
  `type(scope): description`, imperative and lower-case, subject at most 72 characters.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
  - Scopes in use: `scene`, `avatar`, `data`, `ui`, `app`, `server`, `collector`.
- No attribution trailers or footers: no `Co-Authored-By`, no `Claude-Session`, and no
  "Generated with Claude Code" lines, in commit messages or in PR descriptions.
- Author and committer: `farizdotid <17017569+farizdotid@users.noreply.github.com>`.
- Never rewrite or force-push `main` without the owner's explicit approval.
