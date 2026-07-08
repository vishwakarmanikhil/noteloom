import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'BlockEditor',
      fileName: (format) => `block-editor.${format === 'es' ? 'es.js' : 'cjs.js'}`,
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
