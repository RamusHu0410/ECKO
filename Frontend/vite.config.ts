import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // three.js is most of a megabyte and is deliberately in its own lazy chunk (the studio loads
    // it, the intro and the other pages never do), so the default 500 kB warning is noise here.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // The browser calls /api/...; Vite forwards it to the Flask dev server on port 8000 with the
    // /api prefix removed (/api/upload → /upload), so requests stay same-origin and need no CORS.
    proxy: {
      // Except the Auth0-protected API (backend/src/app/routes/account.py, posts.py, users.py),
      // which Flask itself serves under /api/..., so it's forwarded unchanged. Listed first: Vite
      // uses the first rule that matches.
      '^/api/(me|recordings|posts|users)(/|$)': {
        target: 'http://localhost:8000',
      },
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
