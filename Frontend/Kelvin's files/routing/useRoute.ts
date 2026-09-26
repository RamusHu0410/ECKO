import { useCallback, useEffect, useState } from 'react'

/*
 * The pages, on real addresses (/, /profile, /community) so a link can be shared and the back
 * button works. Small enough not to be worth a routing library: the History API plus a listener.
 */

export const ROUTES = ['home', 'profile', 'community'] as const
export type Route = (typeof ROUTES)[number]

const PATHS: Record<Route, string> = {
  home: '/',
  profile: '/profile',
  community: '/community',
}

export function pathOf(route: Route): string {
  return PATHS[route]
}

/** Addresses from before a page was renamed, so old links still land somewhere sensible. */
const MOVED: Record<string, Route> = {
  '/social': 'community',
}

export function routeOf(path: string): Route {
  return (ROUTES.find((route) => PATHS[route] === path) ?? MOVED[path] ?? 'home') as Route
}

/** Goes to a page without reloading. Anything else (a new tab, a modified click) is left alone. */
export function navigate(route: Route): void {
  if (window.location.pathname === PATHS[route]) return
  window.history.pushState(null, '', PATHS[route])
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** The page being shown, kept in step with the address bar and the back button. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.pathname))

  useEffect(() => {
    // an old address shows its new page, and the address bar says so
    const moved = MOVED[window.location.pathname]
    if (moved) window.history.replaceState(null, '', PATHS[moved] + window.location.hash)
    const sync = () => setRoute(routeOf(window.location.pathname))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return route
}

/**
 * For an `<a href>` that should route instead of reloading. The href stays real, so the link can
 * be opened in a new tab, copied, or followed with JavaScript off.
 */
export function useLinkTo(route: Route) {
  const onClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
      event.preventDefault()
      navigate(route)
    },
    [route],
  )
  return { href: PATHS[route], onClick }
}
