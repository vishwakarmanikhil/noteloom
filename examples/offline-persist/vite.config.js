import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    // Makes the app SHELL (HTML/JS/CSS) load with no network at all, on
    // repeat visits, via a precaching service worker -- the piece
    // usePersistedDocument's IndexedDB persistence doesn't cover by
    // itself (that only makes the DOCUMENT data offline-capable; opening
    // the app in the first place still needed the dev/host server
    // reachable without this). `registerType: 'prompt'` means an updated
    // build installs but stays WAITING rather than taking over
    // immediately -- exactly the state useServiceWorkerUpdate.js watches
    // for, so the app can surface "a new version is available" instead of
    // silently swapping the running app out from under an open tab.
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'noteloom offline example',
        short_name: 'noteloom',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2b6fd6',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  resolve: {
    alias: {
      noteloom: path.resolve(__dirname, '../../src/index.js'),
    },
  },
});
