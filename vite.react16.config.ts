import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  publicDir: false,
  plugins: [react({ jsxRuntime: 'classic' })],
  oxc: { jsx: { runtime: 'classic' }, jsxInject: "import * as React from 'react'" },
  resolve: {
    alias: {
      '@layout/runtime': fileURLToPath(new URL('./src/react16/runtime.tsx', import.meta.url)),
    },
  },
  build: {
    outDir: 'packages/react16/dist-lib',
    lib: { entry: 'src/lib/index.ts', formats: ['es'], fileName: () => 'react-konva-layout.js' },
    rollupOptions: {
      external: (id) =>
        /^(react|react-dom|react-konva|konva|use-sync-external-store)(\/|$)/.test(id),
    },
  },
});
