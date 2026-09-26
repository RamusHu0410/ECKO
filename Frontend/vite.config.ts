import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // pass /upload requests on to the Flask backend, which must run on port 8000
  server: {
    proxy: { '/upload': 'http://localhost:8000' },
  },
})
