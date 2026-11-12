import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const cleanUrlPlugin = () => ({
  name: 'clean-urls',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // Abaikan jika route adalah /api (proxy) atau memiliki ekstensi file
      if (req.url && !req.url.startsWith('/api') && !req.url.includes('.') && req.url !== '/') {
        const pathUrl = new URL(req.url, `http://${req.headers.host}`);
        const htmlPath = resolve(__dirname, pathUrl.pathname.slice(1) + '.html');
        if (fs.existsSync(htmlPath)) {
          req.url = pathUrl.pathname + '.html' + pathUrl.search;
        }
      }
      next();
    });
  }
});

export default defineConfig({
  plugins: [cleanUrlPlugin()],
  publicDir: '../public',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        detail: resolve(__dirname, 'detail.html'),
        account: resolve(__dirname, 'account.html'),
        wa_status: resolve(__dirname, 'wa-status.html')
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
});
