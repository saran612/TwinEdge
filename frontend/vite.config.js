import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'serve-wasm-raw',
      configureServer(server) {
        // Intercept /wasm/ requests before Vite's module transform pipeline
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/wasm/')) {
            const urlPath = req.url.split('?')[0];
            const filePath = path.join(process.cwd(), 'public', urlPath);
            if (fs.existsSync(filePath)) {
              if (filePath.endsWith('.wasm')) {
                res.setHeader('Content-Type', 'application/wasm');
              } else if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript');
              }
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(fs.readFileSync(filePath));
              return;
            }
          }
          next();
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: false,
    },
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/predict': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/telemetry': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/alerts': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})

