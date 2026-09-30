import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Same PORT as the API server (from .env or the environment), default 9600.
  const env = loadEnv(mode, process.cwd(), '');
  const api = `http://127.0.0.1:${env.PORT || '9600'}`;

  return {
    server: {
      host: '127.0.0.1',
      strictPort: true,
      proxy: {
        '/api': api,
        '/events': api,
      },
    },
    preview: {
      host: '127.0.0.1',
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
