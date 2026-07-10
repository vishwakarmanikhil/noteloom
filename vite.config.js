import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'Noteloom',
      // The CJS build MUST end in `.cjs`, not `.cjs.js` — with "type":
      // "module" set in package.json, Node treats every plain `.js` file
      // as ESM purely by extension, regardless of what's actually written
      // inside it, so a `require()` consumer loading a CJS-syntax file
      // still named `.js` fails outright (ERR_REQUIRE_ESM). `.cjs` is
      // always CommonJS to Node no matter what "type" says.
      fileName: (format) => (format === 'es' ? 'noteloom.es.js' : 'noteloom.cjs'),
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM' },
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
