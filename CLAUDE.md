# CLAUDE.md

Source of truth: [`PRD.md`](./PRD.md). Read it fully before writing code.

Key rules (details in PRD section 0, 6, 6A):

- One phase per turn (PRD section 7). Plan first (≤10 lines), then stop and report after each phase.
- Collector is read-only; only allowlisted commands via `execFile`, no shell. Bind to `127.0.0.1`.
- Browser gets status and numbers only. No prompt, session, or log content.
- Treat every commit as public: no secrets, IPs, hostnames, private paths, or real profile/job names.
  Private settings live in `config.local.json` (git-ignored); commit only `config.example.json`.
- Pin exact dependency versions. No telemetry, no runtime CDN.
- Run `npm run build`, `npm run typecheck`, and `npm test` before reporting done.
- Never change repository visibility.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
  `type(scope): description`, imperative and lower-case, subject at most 72 characters.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
  - Scopes in use: `scene`, `avatar`, `data`, `ui`, `app`, `server`, `collector`.
- No attribution trailers or footers: no `Co-Authored-By`, no `Claude-Session`, and no
  "Generated with Claude Code" lines, in commit messages or in PR descriptions.
- Author and committer: `farizdotid <17017569+farizdotid@users.noreply.github.com>`.
- Never rewrite or force-push `main` without the owner's explicit approval.
