import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // pass /upload requests on to the backend
  server: {
    proxy: { '/upload': 'http://localhost:8000' },
  },
})
