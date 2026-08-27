import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fixture app for the golden-document e2e spec. Same noteloom -> src alias
// convention as every app under examples/.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      noteloom: path.resolve(__dirname, '../../../src/index.js'),
    },
  },
});
