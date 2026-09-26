import RecordDisc from '../components/RecordDisc/RecordDisc'

/**
 * The whole page: the title, then the disc exactly centered (the grid's outer rows share the
 * leftover height), then the disc's buttons and messages below it.
 */
export default function HomePage() {
  return (
    <main className="grid min-h-dvh grid-rows-[1fr_auto_1fr] justify-items-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <h1 className="self-end pb-[clamp(1rem,4vh,2.5rem)] font-display text-4xl tracking-wide text-on-wood sm:text-5xl">
        ECKO
      </h1>
      <RecordDisc />
    </main>
  )
}
