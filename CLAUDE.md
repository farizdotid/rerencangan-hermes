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
