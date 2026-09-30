import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { ConfigError, loadConfig } from './config';
import { DemoSource } from './demo';
import { SseHub } from './sse';

const rootDir = resolve(import.meta.dirname, '..');

function fail(message: string): never {
  console.error(`rerencangan-hermes: ${message}`);
  process.exit(1);
}

const envFile = resolve(rootDir, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

let config;
try {
  config = loadConfig({ rootDir });
} catch (err) {
  if (err instanceof ConfigError) fail(err.message);
  throw err;
}

if (config.mode === 'real') {
  fail('MODE=real (Hermes CLI collector) is not implemented yet. Use MODE=demo for now.');
}

const source = new DemoSource(config.agents);
const hub = new SseHub();
source.onChange((snapshot) => hub.broadcast('snapshot', snapshot));

const distDir = resolve(rootDir, 'dist');
const staticDir = existsSync(resolve(distDir, 'index.html')) ? distDir : null;

const server = createApp({ source, hub, staticDir });
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') fail(`port ${config.port} is already in use (set PORT to change it)`);
  fail(err.message);
});

server.listen(config.port, config.host, () => {
  source.start();
  const url = `http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${config.port}`;
  console.log(`rerencangan-hermes: ${config.mode} mode, ${config.agents.length} agent(s) from ${config.configFile}`);
  console.log(`rerencangan-hermes: listening on ${url}${staticDir ? '' : ' (API only; run "npm run build" to serve the UI)'}`);
});

function shutdown(): void {
  source.stop();
  hub.close();
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
