# Rerencangan Hermes

A 3D virtual office (Three.js) that shows the status of your
Hermes Agent profiles at a glance.
Each agent is a character: working agents type at their desk, idle ones relax,
failing ones raise an alarm. *Rerencangan* means "friends" in Sundanese.

> **Unofficial project.** Rerencangan Hermes is not affiliated with, endorsed by,
> or maintained by Nous Research or the authors of Hermes Agent. "Hermes" here
> only refers to the agent being monitored.

**Status:** early development (Phase 3: demo server with live updates). See [`PRD.md`](./PRD.md) for
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
The pill in the top-right shows the server connection; the page reconnects
by itself if the server restarts. If the server stays unreachable for more
than 10 seconds, every agent is shown offline.

In dev mode a small FPS counter shows in the top-left corner, and keys
`1`–`5` force every agent into `idle`, `working`, `error`, `celebrating`, or
`offline`; `0` returns to server data.

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

`MODE=demo` (default) shows fake data and never touches Hermes. `MODE=real`
(the read-only Hermes collector) is not implemented yet.

## Security model

- **Read-only.** The collector never writes to the Hermes data directory and
  never runs commands that change Hermes state. There are no buttons to start,
  stop, or edit agents or jobs.
- **Command allowlist.** Only explicitly listed Hermes CLI commands are run,
  via `execFile` (no shell), with a timeout and output size limit.
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
