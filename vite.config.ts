import { defineConfig, splitVendorChunkPlugin } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Code splitting: TF.js and COCO-SSD in their own chunks
        manualChunks(id) {
          if (id.includes('@tensorflow')) return 'tfjs';
          if (id.includes('coco-ssd')) return 'coco-ssd';
          if (id.includes('idb')) return 'idb';
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
