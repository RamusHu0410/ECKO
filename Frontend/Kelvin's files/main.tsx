import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './design/global.css'
import App from './App'

/** A developer page for testing sign-in, outside the app: no header, no link to it, loaded only there. */
const AuthTestPage = lazy(() => import('./pages/AuthTestPage'))

const root = document.getElementById('root')
if (!root) throw new Error('index.html is missing the #root element')

createRoot(root).render(
  <StrictMode>
    {window.location.pathname === '/auth-test' ? (
      <Suspense fallback={null}>
        <AuthTestPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
