# Rerencangan Hermes

A 3D virtual office (Three.js) that shows the status of your
Hermes Agent profiles at a glance.
Each agent is a character: working agents type at their desk, idle ones relax,
failing ones raise an alarm. *Rerencangan* means "friends" in Sundanese.

> **Unofficial project.** Rerencangan Hermes is not affiliated with, endorsed by,
> or maintained by Nous Research or the authors of Hermes Agent. "Hermes" here
> only refers to the agent being monitored.

**Status:** early development (Phase 2: avatars with demo data). See [`PRD.md`](./PRD.md) for
the full plan.

## Requirements

- Node.js 22.12 or newer
- npm

## Getting started

```sh
npm install
npm run dev        # http://127.0.0.1:5173
```

In the browser: drag to orbit (limited range), scroll to zoom. Panning is disabled.
In dev mode a small FPS counter shows in the top-left corner, and keys
`1`–`5` force every agent into `idle`, `working`, `error`, `celebrating`, or
`offline`; `0` returns to random demo data.

Other scripts:

| Command             | What it does                        |
|---------------------|-------------------------------------|
| `npm run build`     | Typecheck and build to `dist/`      |
| `npm run typecheck` | TypeScript check only               |
| `npm test`          | Run unit tests (Vitest)             |
| `npm run preview`   | Serve the production build locally  |

## Configuration

Private settings never go into git.

- Copy `config.example.json` to `config.local.json` and list your profiles there.
- Copy `.env.example` to `.env` to change host, port, or data mode.

Both `config.local.json` and `.env` are git-ignored.

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
- **Local only.** The server binds to `127.0.0.1`. For a remote machine, use an
  SSH tunnel. Do not expose it to the internet.

See [`SECURITY.md`](./SECURITY.md) for how to report a vulnerability.

## License

[MIT](./LICENSE). Asset sources and licenses are listed in [`ASSETS.md`](./ASSETS.md).
