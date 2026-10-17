import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: 'dist-lib',
    lib: { entry: 'src/lib/index.ts', formats: ['es'], fileName: () => 'react-konva-layout.js' },
    rollupOptions: { external: (id) => /^(react|react-dom|react-konva|konva)(\/|$)/.test(id) },
  },
});
