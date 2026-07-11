import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5741',
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: 'http://localhost:5741',
        changeOrigin: true,
      },
      '/vendor': {
        target: 'http://localhost:5741',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  plugins: [
    {
      name: 'copy-vendor',
      closeBundle() {
        const vendorSrc = resolve(__dirname, 'vendor');
        const vendorDest = resolve(__dirname, 'dist', 'vendor');
        if (!existsSync(vendorDest)) mkdirSync(vendorDest, { recursive: true });
        copyFileSync(resolve(vendorSrc, 'maplibre-gl.js'), resolve(vendorDest, 'maplibre-gl.js'));
        copyFileSync(resolve(vendorSrc, 'maplibre-gl.css'), resolve(vendorDest, 'maplibre-gl.css'));
      },
    },
  ],
});
