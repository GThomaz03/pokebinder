import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5173,
    // HTTPS via basicSsl — required for getUserMedia on phones over LAN
    proxy: {
      '/api/tcgdex': {
        target: 'https://api.tcgdex.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tcgdex/, '/v2'),
      },
      '/api/pokemontcg': {
        target: 'https://api.pokemontcg.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pokemontcg/, '/v2'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web', '@xenova/transformers'],
  },
  worker: {
    format: 'es',
  },
})
