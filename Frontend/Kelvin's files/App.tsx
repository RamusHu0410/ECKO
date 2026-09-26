import { lazy, Suspense } from 'react'
import HomePage from './pages/HomePage'
import SiteHeader from './components/SiteHeader/SiteHeader'
import { useRoute } from './routing/useRoute'

/** Only the studio is needed to start; the other pages load when someone goes to them. */
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))

export default function App() {
  const route = useRoute()

  return (
    <>
      <SiteHeader route={route} />
      {route === 'home' && <HomePage />}
      {route !== 'home' && (
        <Suspense fallback={<main className="min-h-dvh" />}>
          {route === 'profile' && <ProfilePage />}
          {route === 'community' && <CommunityPage />}
        </Suspense>
      )}
    </>
  )
}
