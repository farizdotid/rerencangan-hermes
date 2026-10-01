# Fixtures

Sample Hermes CLI output for parser tests. **Every file here must be sanitized
before it is committed**: replace PIDs, job ids, execution
ids, job names, and profile names with generic values, and never include log
or session content.

| File | Source | Command |
|------|--------|---------|
| `cron-status.running.txt` | Original project spec (sanitized) | `hermes cron status`, gateway running |
| `cron-list.running.txt` | Original project spec (sanitized) | `hermes cron list`, one job executing |
| `cron-list.completed.txt` | Real machine (sanitized) | `hermes cron list`, last run finished ok |
| `profile-list.txt` | Real machine (sanitized) | `hermes profile list`, four profiles |
| `sessions-list.txt` | Real machine (sanitized; titles replaced) | `hermes sessions list` |

Still needed from a real machine (sanitized): `cron list` with a failed job
and an OVERDUE job, and for a profile without jobs; `cron status` with the
gateway stopped; `profile list` with a stopped gateway; `sessions list` while
a session is active.
