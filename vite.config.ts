import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rundotGameLibrariesPlugin } from '@series-inc/rundot-game-sdk/vite';

// CDN assets in cdn/ folder are automatically served in dev mode

export default defineConfig({
  plugins: [
    react(), // Must come first - handles JSX transform
    rundotGameLibrariesPlugin(),
  ],
  base: './',
  server: {
    allowedHosts: true,
  },
  resolve: {
    alias: {
      // three.js r170 doesn't expose ./package.json in its exports map,
      // but the rundot embedded-libraries plugin needs it to detect the
      // installed version. This alias makes it resolvable.
      'three/package.json': path.resolve(__dirname, 'node_modules/three/package.json'),
    },
  },
  // Vite uses esbuild both for transforms and (in dev) dependency prebundling.
  // RUN.game SDK includes top-level await, so we must target an environment that supports it.
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    target: 'es2022', // Support top-level await for embedded libraries
  },
  worker: {
    format: 'es',
  },
});
