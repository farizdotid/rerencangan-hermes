# Rerencangan Hermes

A 3D virtual office (Three.js) that shows the status of your
Hermes Agent profiles at a glance.
Each agent is a character: working agents type at their desk, idle ones relax,
failing ones raise an alarm. *Rerencangan* means "friends" in Sundanese.

> **Unofficial project.** Rerencangan Hermes is not affiliated with, endorsed by,
> or maintained by Nous Research or the authors of Hermes Agent. "Hermes" here
> only refers to the agent being monitored.

**Status:** early development (Phase 4: read-only Hermes collector). See [`PRD.md`](./PRD.md) for
the full plan.

## Requirements

- Node.js 22.12 or newer
- npm

## Getting started

```sh
npm install
```

**Development** (two terminals):

```sh
npm run server     # API + demo data on http://127.0.0.1:9600
npm run dev        # UI with hot reload on http://127.0.0.1:5173 (proxies to the server)
```

**Run it like a real install** (one port):

```sh
npm run build
npm start          # UI + API on http://127.0.0.1:9600
```

In the browser: drag to orbit (limited range), scroll to zoom. Panning is disabled.

- **Top-right card:** server connection, gateway state and heartbeat, how
  many agents are in each state, the next scheduled job, and when data last
  arrived. The page reconnects by itself if the server restarts; if the
  server stays unreachable for more than 10 seconds, every agent is shown
  offline.
- **Click an agent** for details: state, current job, last run, next run, and
  job count. Close with ×, Esc, or a click on empty space.
- **Server rack LEDs:** green when the gateway runs, red when it is stopped,
  amber when there is no fresh data.
- **Naps:** an agent that stays idle for 3 minutes walks to its bed and
  sleeps; it walks back to its desk as soon as a job runs, fails, or finishes.

In dev mode a small FPS counter shows in the top-left corner, and keys
`1`–`5` force every agent into `idle`, `working`, `error`, `celebrating`, or
`offline`; `6` sends everyone to bed right away; `0` returns to server data.

Other scripts:

| Command             | What it does                        |
|---------------------|-------------------------------------|
| `npm run build`     | Typecheck and build to `dist/`      |
| `npm run typecheck` | TypeScript check only               |
| `npm test`          | Run unit tests (Vitest)             |

### API

| Endpoint          | Returns                                                      |
|-------------------|--------------------------------------------------------------|
| `GET /api/agents` | Current snapshot as JSON                                     |
| `GET /events`     | Server-Sent Events: `snapshot` on connect and on change, `ping` every 15 s |

## Configuration

Private settings never go into git.

- Copy `config.example.json` to `config.local.json` and list your profiles there.
  Profile ids may only contain letters, digits, `.`, `_`, and `-`.
- Copy `.env.example` to `.env` to change host, port, or data mode.
  Environment variables win over the config file.

Both `config.local.json` and `.env` are git-ignored. Without
`config.local.json`, the generic profiles from `config.example.json` are used.

The office is laid out for however many agents there are: one desk and one
bed each, up to six desks per row, and the room grows to fit.

`MODE=demo` (default) shows fake data and never touches Hermes.

`MODE=real` reads your Hermes profiles through the CLI, read-only, every 10
seconds. Set `HERMES_BIN` to an absolute path if `hermes` is not on the
server's `PATH`.

```sh
MODE=real npm start
```

Profiles are discovered with `hermes profile list`, so `config.local.json` is
optional in real mode. When present, it only renames, reorders, or hides
profiles:

```json
{
  "agents": [
    { "id": "default", "displayName": "Main" },
    { "id": "some-profile", "hidden": true }
  ]
}
```

Real mode runs only these commands (`server/sources/allowlist.ts`), always as
`hermes -p <profile> ...` for per-profile ones:

| Command | Used for | How often |
|---|---|---|
| `hermes profile list` | Which profiles exist, each profile's gateway | Every 60 s |
| `hermes cron status` | Scheduler gateway, heartbeat age | Every poll |
| `hermes -p <profile> cron list` | Running job, last run, next run, job count | Every poll |
| `hermes -p <profile> sessions list` | Whether a session was active in the last 2 minutes | Every poll |

Session titles in `sessions list` are dropped by the parser and never reach
the browser; only how long ago a session was active is used.

Each poll starts `1 + 2 × profiles` short `hermes` processes, one at a time.
If that is too heavy for a small VPS, check how long one takes with
`time hermes cron list`.

State rules, in priority order: the profile's gateway not running →
`offline`; a failed run in the last 30 minutes → `error`; a running job or a
session active in the last 2 minutes → `working`; a successful run in the
last 2 minutes → `celebrating`; otherwise `idle`. Output that cannot be
understood shows `idle` with an "unknown" flag.

## Security model

- **Read-only.** The collector never writes to the Hermes data directory and
  never runs commands that change Hermes state. There are no buttons to start,
  stop, or edit agents or jobs.
- **Command allowlist.** Only explicitly listed Hermes CLI commands are run,
  via `execFile` (no shell), with a timeout, an output size limit, stdin
  closed, and a minimal environment (no tokens or keys from the server's own
  environment are passed on). Profile ids are validated before use.
- **Status and numbers only.** The browser receives state, job name,
  timestamps, and counts. Never prompts, session content, or log lines.
- **Untrusted input.** CLI output is parsed defensively, escaped before
  rendering, and never evaluated.
- **Local only.** The server refuses to bind to anything but a loopback
  address (`127.0.0.1` by default). For a remote machine, use an SSH tunnel.
  Do not expose it to the internet.
- **No cross-site access.** Requests whose `Host` header is not a loopback
  name are rejected (protects against DNS rebinding), there are no CORS
  headers, and the UI is served with a strict same-origin Content Security
  Policy.

See [`SECURITY.md`](./SECURITY.md) for how to report a vulnerability.

## License

[MIT](./LICENSE). Asset sources and licenses are listed in [`ASSETS.md`](./ASSETS.md).
