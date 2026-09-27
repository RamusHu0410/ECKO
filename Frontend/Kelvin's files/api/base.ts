/*
 * Where the backend is. Every call to it goes through apiUrl('/api/...').
 *
 * In development VITE_API_URL is unset, so paths stay relative and the Vite dev server forwards
 * /api/... to Flask (vite.config.ts). Production builds read it from .env.production and call the
 * backend's own domain directly (Flask allows cross-origin requests, see CORS in app/__init__.py).
 */
const API_ORIGIN = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`
}
