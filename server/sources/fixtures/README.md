# Fixtures

Sample Hermes CLI output for parser tests. **Every file here must be sanitized
before it is committed** (PRD section 6A): replace PIDs, job ids, execution
ids, job names, and profile names with generic values, and never include log
or session content.

| File | Source | Command |
|------|--------|---------|
| `cron-status.running.txt` | PRD appendix A (sanitized) | `hermes cron status`, gateway running |
| `cron-list.running.txt` | PRD appendix A (sanitized) | `hermes cron list`, one job executing |

Still needed from a real machine (sanitized): `cron list` with a finished job,
a failed job, and an OVERDUE job; `cron status` with the gateway stopped;
`sessions list` for each profile.
