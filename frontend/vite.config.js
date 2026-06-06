import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5741',
        changeOrigin: true,
        secure: false,
        ws: true
      },
      '/images': {
        target: 'http://localhost:5741',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});