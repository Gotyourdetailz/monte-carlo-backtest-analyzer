import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    worker: {
      format: 'es' as const,
      plugins: () => [wasm(), topLevelAwait()],
    },
    server: {
      // Bind to loopback by default so uploaded Trade_Data and source maps are not
      // reachable from the LAN. Use `npm run dev:lan` for explicit LAN exposure.
      host: '127.0.0.1',
      allowedHosts: ['localhost'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
