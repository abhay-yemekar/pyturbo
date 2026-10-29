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
  server: {
    headers: {
      ...headers,
      'Content-Security-Policy': headers['Content-Security-Policy']
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:*"),
    },
  },
  preview: { headers },
  worker: { format: 'es' },
  plugins: [
    {
      name: 'preview-security-headers',
      configurePreviewServer(server) {
        // Static serving can return 304 before its setHeaders callback runs.
        // Apply isolation headers first so cached worker restarts stay valid.
        server.middlewares.use((_request, response, next) => {
          for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
          next();
        });
      },
    },
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
