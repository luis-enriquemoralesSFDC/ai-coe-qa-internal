import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    // Polling en lugar del watcher nativo de FS: evita que el watcher
    // se desincronice cuando los archivos se editan rápidamente desde
    // procesos externos (como un agente de Cursor).
    watch: {
      usePolling: true,
      interval: 200,
    },
  },
})
