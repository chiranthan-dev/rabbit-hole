import { defineConfig } from 'vite';
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
        navigateFallbackDenylist: [/^\/ollama/, /^\/lmstudio/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1000 },
  server: { host: true, proxy },
  preview: { host: true, proxy },
});
