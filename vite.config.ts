import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const headers = Object.fromEntries(
  readFileSync(new URL('./public/_headers', import.meta.url), 'utf8')
    .split('/assets/')[0]
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(2, colon), line.slice(colon + 1).trim()];
    }),
);

export default defineConfig({
  server: { headers },
  preview: { headers },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['fonts/*', 'icons/*'],
      manifest: {
        name: 'PyTurbo',
        short_name: 'PyTurbo',
        description: "Code Python like it's 1992.",
        theme_color: '#0000aa',
        background_color: '#000000',
        display: 'standalone',
        icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,woff,woff2,ttf,svg,py}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/pyodide\/v314\.0\.7\/full\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pyodide-314.0.7',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
