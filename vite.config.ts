import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import { handleAccount, memoryKV, redisKV, type KV } from './api/account';

// Serves /api/account during `npm run dev` / `npm run preview`, exactly like
// the Vercel Function in production. Uses Upstash if its env vars are in
// .env.local, otherwise an in-memory store (accounts reset when you restart).
function localSyncApi(): Plugin {
  let kv: KV | null = null;
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/account')) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const response = await handleAccount(request, kv);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(await response.text());
  };
  return {
    name: 'local-sync-api',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), '');
      kv = redisKV(env) ?? memoryKV();
    },
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Local model servers. The /ollama and /lmstudio proxies let the browser
// talk to models on this machine without any CORS setup.
const proxy = {
  '/ollama': {
    target: 'http://127.0.0.1:11434',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/ollama/, ''),
  },
  '/lmstudio': {
    target: 'http://127.0.0.1:1234',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/lmstudio/, ''),
  },
};

// Which build is this? Shown in the app so you can tell if a deploy is live.
function buildVersion() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    localSyncApi(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/main.tsx so we control update checks and reloads.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rabbit Hole',
        short_name: 'Rabbit Hole',
        description: 'One topic. One week. Real understanding.',
        theme_color: '#161316',
        background_color: '#161316',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/m',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/ollama/, /^\/lmstudio/, /^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // New versions take over straight away and old caches are removed.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1000 },
  server: { host: true, proxy },
  preview: { host: true, proxy },
});
