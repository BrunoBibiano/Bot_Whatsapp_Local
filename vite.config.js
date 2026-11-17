import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'frontend', publicDir: false, plugins: [react()],
  build: { outDir: '../public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:3010', '/socket.io': { target: 'http://127.0.0.1:3010', ws: true } } },
});
