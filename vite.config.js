import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      // One entry per published subpath (see package.json "exports" and
      // docs/repackaging-plan.md Phase 1). The main `noteloom` entry
      // (index) still re-exports everything the feature entries do, so
      // nothing that imported from 'noteloom' before breaks; the point of
      // the split is that a consumer importing only `noteloom` +
      // `noteloom/react`-level pieces no longer pulls WebRTC / canvas /
      // SpeechRecognition / IndexedDB code into their bundle.
      entry: {
        index: 'src/index.js',
        collab: 'src/collab.js',
        persistence: 'src/persistence.js',
        comments: 'src/comments.js',
        versions: 'src/versions.js',
        voice: 'src/voice.js',
        canvas: 'src/canvas.js',
      },
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      // One output config per format so the extension is right on BOTH
      // entry files and shared chunks. With "type": "module" in
      // package.json, Node treats every plain `.js` file as ESM purely by
      // extension — so a `require()` that pulls in a CJS-syntax chunk still
      // named `.js` fails outright (ERR_REQUIRE_ESM). Every CJS artifact,
      // chunks included, must end in `.cjs`.
      output: [
        {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: 'shared/[name]-[hash].js',
          globals: { react: 'React', 'react-dom': 'ReactDOM' },
        },
        {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: 'shared/[name]-[hash].cjs',
          exports: 'named',
          globals: { react: 'React', 'react-dom': 'ReactDOM' },
        },
      ],
    },
    cssCodeSplit: false,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: true,
    // test-e2e/ is a separate Playwright suite (npm run test:e2e) -- its
    // files import `test`/`expect` from '@playwright/test', not vitest,
    // and vitest would otherwise try to collect and run them too.
    exclude: ['node_modules/**', 'test-e2e/**'],
  },
});
