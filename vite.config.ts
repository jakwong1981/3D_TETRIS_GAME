import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// DEV_HTTPS=1 serves the dev server over HTTPS with a throwaway self-signed cert (HMR stays on).
const useHttps = process.env.DEV_HTTPS === '1';
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  root: 'src/game',
  publicDir: false,
  plugins: useHttps ? [basicSsl()] : [],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: { '/api': apiTarget },
  },
  preview: {
    proxy: { '/api': apiTarget },
  },
});
