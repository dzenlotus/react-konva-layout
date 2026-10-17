import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const legacy = fileURLToPath(new URL('./packages/react16/', import.meta.url));
export default defineConfig({
  root: `${legacy}example`,
  base: './',
  cacheDir: `${legacy}node_modules/.vite`,
  optimizeDeps: { entries: ['index.html'] },
  plugins: [react({ jsxRuntime: 'classic' })],
  resolve: {
    alias: [
      {
        find: '@dzenlotus/react-konva-layout',
        replacement: `${legacy}dist-lib/react-konva-layout.js`,
      },
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
  build: { outDir: '../dist-demo', emptyOutDir: true },
});
