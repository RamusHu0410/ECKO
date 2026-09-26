import type { ReactNode } from 'react'
import { useLinkTo, type Route } from '../../routing/useRoute'

/**
 * The bar over every page: the ECKO wordmark at the top-left, which always leads home, and the
 * Community and Profile glass icons at the top-right. The page being shown is marked for screen
 * readers and carries the amber underline.
 */
export default function SiteHeader({ route }: { route: Route }) {
  const home = useLinkTo('home')

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-6 lg:px-12 lg:py-8">
      <a {...home} className="font-display text-4xl tracking-wide text-ink" aria-label="ECKO, home">
        ECKO
      </a>
      <nav className="flex items-center gap-3" aria-label="Pages">
        <IconLink to="community" label="Community" current={route}>
          <PeopleIcon />
        </IconLink>
        <IconLink to="profile" label="Profile" current={route}>
          <PersonIcon />
        </IconLink>
      </nav>
    </header>
  )
}

function IconLink({ to, label, current, children }: { to: Route; label: string; current: Route; children: ReactNode }) {
  const link = useLinkTo(to)
  const here = current === to
  return (
    <a
      {...link}
      className="glass-surface glass-icon relative text-ink"
      aria-label={label}
      aria-current={here ? 'page' : undefined}
      title={label}
    >
      <span className="glass-content grid place-items-center">{children}</span>
      {here && <span className="absolute -bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-amber" aria-hidden="true" />}
    </a>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 19.4a7 7 0 0 1 14 0" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <circle cx="9.3" cy="9" r="3.1" />
      <path d="M3.4 18.8a6 6 0 0 1 11.8 0" />
      <path d="M16.2 6.2a3.1 3.1 0 0 1 0 5.7M17.4 13.6a6 6 0 0 1 3.2 5.2" />
    </svg>
  )
}
