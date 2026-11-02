/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Only relevant behind an HTTPS ingress in hosted dev environments.
  const hmrClientPort = env.WDS_SOCKET_PORT ? Number(env.WDS_SOCKET_PORT) : undefined;
  return {
    // Static-hosting base path, e.g. "/my-repo/" for GitHub Pages project sites.
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    worker: { format: 'es' },
    server: {
      allowedHosts: true,
      hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
    },
    preview: { allowedHosts: true },
    build: { target: 'es2022', outDir: 'build', chunkSizeWarningLimit: 2500 },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'node',
      setupFiles: ['src/test/setup.ts'],
      testTimeout: 30000,
    },
  };
});
