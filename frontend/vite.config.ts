import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS=1 npm run dev  -> self-signed HTTPS so the mic works when testing from a phone on the LAN.
const https = process.env.HTTPS === '1'

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: {
    host: true,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
