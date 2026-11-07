import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  // PowerSync ships web workers and WASM files; Vite must not pre-bundle it.
  optimizeDeps: { exclude: ['@powersync/web'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 900 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // The SQLite WASM files are larger than the 2 MB default and must be cached to work offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,wasm,woff2,png,svg}'],
        // The encrypted ("mc") SQLite builds are not used; leaving them out halves the first download.
        globIgnores: ['**/mc-wa-sqlite*'],
        navigateFallback: '/index.html',
        // Real pages, not part of the app: never answer them with the app.
        navigateFallbackDenylist: [/^\/(privacy|terms)(\.html)?$/],
        // Shows expiry reminders sent by the server (public/push-sw.js).
        importScripts: ['/push-sw.js']
      },
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Namliyeh · النملية',
        short_name: 'النملية',
        description: 'What we have, what we used, what to buy, and where the money goes.',
        lang: 'ar',
        dir: 'auto',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        theme_color: '#33452a',
        background_color: '#f6f7f2',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
