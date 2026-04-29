import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true, // Force this port, fail if busy
    hmr: {
      overlay: false, // Disable error overlay popup
    },
    // ✅ CRITICAL: Proxy API requests to backend server
    proxy: {
      '/api': {
        target: 'http://localhost:8101',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:8101',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "#minpath": path.resolve(__dirname, "./node_modules/vfile/lib/minpath.js"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Add hash to filenames for cache busting
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  }
});
