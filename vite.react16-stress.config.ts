import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const legacy = fileURLToPath(new URL('./packages/react16/', import.meta.url));

export default defineConfig({
  root: `${legacy}stress`,
  base: './',
  publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
  cacheDir: `${legacy}node_modules/.vite-stress`,
  optimizeDeps: { entries: ['index.html'] },
  plugins: [react({ jsxRuntime: 'classic' })],
  oxc: { jsx: { runtime: 'classic' }, jsxInject: "import * as React from 'react'" },
  resolve: {
    alias: [
      // Run the shared scene against the packaged compatibility build.
      { find: /^(?:\.\.\/)+lib$/, replacement: `${legacy}dist-lib/react-konva-layout.js` },
      { find: /^react$/, replacement: `${legacy}node_modules/react/index.js` },
      { find: /^react-dom$/, replacement: `${legacy}node_modules/react-dom/index.js` },
      { find: /^react-konva$/, replacement: `${legacy}node_modules/react-konva/lib/ReactKonva.js` },
      { find: /^konva(?:\/lib\/Core)?$/, replacement: `${legacy}node_modules/konva/konva.js` },
      { find: /^konva\//, replacement: `${legacy}node_modules/konva/` },
      {
        find: 'use-sync-external-store/shim',
        replacement: `${legacy}node_modules/use-sync-external-store/shim/index.js`,
      },
    ],
  },
  build: { outDir: '../dist-stress', emptyOutDir: true },
});
