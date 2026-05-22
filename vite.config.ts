import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localApiProxy = {
  changeOrigin: true,
  target: `http://127.0.0.1:${process.env.BOT_PORT || '8797'}`,
};

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    allowedHosts: true,
    proxy: {
      '/api': localApiProxy,
    },
  },
  preview: {
    proxy: {
      '/api': localApiProxy,
    },
  },
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
});
