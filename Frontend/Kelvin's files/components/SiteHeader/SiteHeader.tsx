/** The ECKO wordmark at the top-left of every page; it leads home. */
export default function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-6 lg:px-12 lg:py-8">
      <a href="/" className="font-display text-4xl tracking-wide text-ink" aria-label="ECKO, home">
        ECKO
      </a>
    </header>
  )
}
