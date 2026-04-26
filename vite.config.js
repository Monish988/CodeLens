import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/resolve-cache': {
        target: 'https://hf-mirror.com',
        changeOrigin: true,
      },
      '/api/models': {
        target: 'https://hf-mirror.com',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/hf-mirror': {
        target: 'https://hf-mirror.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hf-mirror/, ''),
      },
    },
  },
})
