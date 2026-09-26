import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The browser calls /api/...; Vite forwards it to the Flask dev server on port 8000 with the
    // /api prefix removed (/api/upload → /upload), so requests stay same-origin and need no CORS.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
        // When the backend is down, answer 502 and close the connection. Otherwise the browser
        // reuses a connection with an unread upload on it, and "Try again" stalls for seconds.
        configure: (proxy) => {
          proxy.on('error', (_error, _request, response) => {
            if (!('writeHead' in response) || response.headersSent) return
            response.writeHead(502, { Connection: 'close', 'Content-Type': 'text/plain' })
            response.end('The backend is not running.')
          })
        },
      },
    },
  },
})
