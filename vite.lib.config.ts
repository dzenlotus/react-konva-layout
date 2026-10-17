import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: { '@layout/runtime': fileURLToPath(new URL('./src/lib/runtime.tsx', import.meta.url)) },
  },
  build: {
    outDir: 'dist-lib',
    lib: { entry: 'src/lib/index.ts', formats: ['es'], fileName: () => 'react-konva-layout.js' },
    rollupOptions: { external: (id) => /^(react|react-dom|react-konva|konva)(\/|$)/.test(id) },
  },
});
