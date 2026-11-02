import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleSync, memoryKV, redisKV } from './api/sync';

// Serves /api/sync during `npm run dev` / `npm run preview`, just like the
// Vercel Function does in production. Uses Upstash if its env vars are in
// .env.local, otherwise an in-memory store (handy for trying sync on LAN).
function localSyncApi(): Plugin {
  let kv: ReturnType<typeof memoryKV> | null = null;
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/sync')) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const response = await handleSync(request, kv);
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

export default defineConfig({
  plugins: [
    localSyncApi(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1000 },
  server: { host: true, proxy },
  preview: { host: true, proxy },
});
