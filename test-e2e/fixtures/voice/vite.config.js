import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fixture app for the voice-permission e2e spec. Same noteloom -> src alias
// convention as every app under examples/, plus an explicit alias for the
// `noteloom/voice` subpath (no example wires that one yet) since Vite's
// object-form `alias` only exact-matches each key, not a `noteloom` prefix.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      'noteloom/voice': path.resolve(__dirname, '../../../src/voice.js'),
      noteloom: path.resolve(__dirname, '../../../src/index.js'),
    },
  },
});
