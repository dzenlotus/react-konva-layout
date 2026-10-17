import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './',
  cacheDir: 'node_modules/.vite-react19',
  optimizeDeps: { entries: ['index.html'] },
  resolve: {
    alias: { '@layout/runtime': fileURLToPath(new URL('./src/lib/runtime.tsx', import.meta.url)) },
  },
});
