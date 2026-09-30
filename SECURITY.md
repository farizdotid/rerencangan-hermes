# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Security" tab → "Report a vulnerability") on this repository.
Include steps to reproduce and the affected version or commit.

## Deployment warning

Rerencangan Hermes is a **local, single-user** tool.

- The server binds to `127.0.0.1` by default. Keep it that way.
- For remote access, use an SSH tunnel. **Never expose it to the internet**
  (no public bind, no reverse proxy, no port forwarding on a router).
- There is no authentication by design; anyone who can reach the port can
  see agent status.

## Security model

- The collector is **read-only**: it never writes to the Hermes data
  directory and never runs commands that change Hermes state.
- Only commands in an explicit allowlist are executed, via `execFile`
  (no shell), with a timeout and an output size limit.
- CLI output is treated as untrusted data: parsed defensively, escaped
  before rendering, never evaluated.
- The browser receives **status and numbers only** (state, job name,
  timestamps, counts). No prompt, session, or log content.
- Secrets and config files (`.env`, `config.yaml`, credentials, SSH keys,
  `state.db`) are never read.
