/*
 * The page backgrounds (styles in backdrops.css). The one picked is remembered in this browser and
 * set on <body> as data-backdrop, plus data-backdrop-tone="dark" for the dark ones, which turn the
 * page's text light.
 */

export const BACKDROPS = [
  { id: 'paper', name: 'Paper', dark: false },
  { id: 'galaxy', name: 'Galaxy', dark: true },
  { id: 'aurora', name: 'Aurora', dark: true },
  { id: 'sunset', name: 'Sunset', dark: false },
  { id: 'ocean', name: 'Ocean', dark: false },
] as const

export type BackdropId = (typeof BACKDROPS)[number]['id']

const SAVED_KEY = 'ecko:backdrop'

/** The background picked last in this browser, or paper. */
export function savedBackdrop(): BackdropId {
  try {
    const saved = window.localStorage.getItem(SAVED_KEY)
    return BACKDROPS.find((backdrop) => backdrop.id === saved)?.id ?? 'paper'
  } catch {
    return 'paper'
  }
}

/** Shows this background on every page, and remembers it. */
export function applyBackdrop(id: BackdropId): void {
  const body = document.body
  if (id === 'paper') {
    delete body.dataset.backdrop
    delete body.dataset.backdropTone
  } else {
    body.dataset.backdrop = id
    if (BACKDROPS.find((backdrop) => backdrop.id === id)?.dark) body.dataset.backdropTone = 'dark'
    else delete body.dataset.backdropTone
  }
  try {
    window.localStorage.setItem(SAVED_KEY, id)
  } catch {
    // storage blocked: the background just resets on the next visit
  }
}
