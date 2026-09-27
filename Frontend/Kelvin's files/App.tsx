import { lazy, Suspense, useEffect, useState } from 'react'
import HomePage from './pages/HomePage'
import SiteHeader from './components/SiteHeader/SiteHeader'
import { useRoute } from './routing/useRoute'

/** Only the studio is needed to start; the other pages load when someone goes to them. */
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const AuthTestPage = lazy(() => import('./pages/AuthTestPage'))

/** The sign-in page's address (the header's Sign in button). It isn't one of the router's pages. */
const SIGN_IN_PATH = '/auth-test'

export default function App() {
  const route = useRoute()
  const signingIn = useOnSignInPage()

  return (
    <>
      <SiteHeader route={route} />
      {!signingIn && route === 'home' && <HomePage />}
      {(signingIn || route !== 'home') && (
        <Suspense fallback={<main className="min-h-dvh" />}>
          {/* the sign-in page, below the header like every other page */}
          {signingIn && (
            <div className="pt-20 lg:pt-24">
              <AuthTestPage />
            </div>
          )}
          {!signingIn && route === 'profile' && <ProfilePage />}
          {!signingIn && route === 'community' && <CommunityPage />}
        </Suspense>
      )}
    </>
  )
}

/** Whether the address is the sign-in page; it follows the header's links and the back button. */
function useOnSignInPage(): boolean {
  const [here, setHere] = useState(() => window.location.pathname === SIGN_IN_PATH)
  useEffect(() => {
    const sync = () => setHere(window.location.pathname === SIGN_IN_PATH)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  return here
}
