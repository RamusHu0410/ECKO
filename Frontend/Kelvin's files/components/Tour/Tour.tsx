import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TOUR } from '../../pages/homeCopy'

export interface TourStep {
  /** What the note points at: a CSS selector, mostly a [data-tour] mark. */
  target: string
  title: string
  body: string
}

/** Remembered in this browser: unset (never toured), "start" (part one seen), "done" (both parts). */
const SEEN_KEY = 'ecko:tour'
/** Part one starts once the mic is this much in view: the visitor has reached the studio. */
const IN_VIEW = 0.9
/** Part two waits this long after the first song arrives, so the record has settled. */
const SONG_SETTLES_MS = 1500

/**
 * Which tour steps are showing, if any. Part one (the record and the mic) plays the first time the
 * studio comes into view; part two (everything a song brings) the first time a song is ready.
 * show() plays every step whose target is on the page, e.g. from the intro's "How to use ECKO".
 */
export function useTour(hasSong: boolean) {
  const [steps, setSteps] = useState<TourStep[] | null>(null)
  const seen = useRef(readSeen())
  const remember = (value: 'start' | 'done') => {
    seen.current = value
    try {
      window.localStorage.setItem(SEEN_KEY, value)
    } catch {
      // storage blocked: the tour just plays again next time
    }
  }

  useEffect(() => {
    const mic = document.querySelector('[data-tour="mic"]')
    if (seen.current || !mic) return
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < IN_VIEW || seen.current) return
        watcher.disconnect()
        remember('start')
        setSteps(TOUR.beforeSong)
      },
      { threshold: IN_VIEW },
    )
    watcher.observe(mic)
    return () => watcher.disconnect()
  }, [])

  useEffect(() => {
    if (!hasSong || seen.current === 'done') return
    const timer = setTimeout(() => {
      remember('done')
      setSteps(TOUR.afterSong)
    }, SONG_SETTLES_MS)
    return () => clearTimeout(timer)
  }, [hasSong])

  const show = useCallback(() => {
    setSteps([...TOUR.beforeSong, ...TOUR.afterSong].filter((step) => document.querySelector(step.target)))
  }, [])
  const close = useCallback(() => {
    setSteps(null)
    document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) // back to where the humming happens
  }, [])
  return { steps, show, close }
}

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

type Side = 'below' | 'above' | 'right' | 'left'
interface Placement {
  side: Side
  x: number
  y: number
  arrow: number // along the note's edge that faces the target, in px
}

const GAP = 18 // between the target and the note (the arrow sits in it)
const EDGE = 12 // keep the note this far inside the window
const SPOTLIGHT_PAD = 8

/**
 * One step of the tour: the page dims except for the thing being explained, and a small glass note
 * beside it, with an arrow pointing at it, says what it's for. Next, Back and Skip (or the arrow
 * keys and Escape) move through the steps; a step whose target isn't on the page is skipped.
 */
export default function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<DOMRect | null>(null)
  const [size, setSize] = useState({ width: 320, height: 200 })
  const note = useRef<HTMLDivElement>(null)
  const step = steps[index]
  const last = index === steps.length - 1
  const next = useCallback(() => (last ? onClose() : setIndex((i) => i + 1)), [last, onClose])
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // bring the target into view, then follow it: the page scrolls, the turntable moves
  useEffect(() => {
    const element = document.querySelector(step.target)
    if (!element) {
      next()
      return
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    let frame = 0
    const follow = () => {
      const now = element.getBoundingClientRect()
      setTarget((was) => (was && sameRect(was, now) ? was : now))
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [step, next])

  useLayoutEffect(() => {
    if (note.current) setSize({ width: note.current.offsetWidth, height: note.current.offsetHeight })
  }, [step])

  useEffect(() => {
    note.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') next()
      else if (event.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, next, back, onClose])

  const place = target && placeNote(target, size)

  return (
    <div className="fixed inset-0 z-50">
      {/* the page is dimmed and can't be clicked while touring; the spotlight's shadow is the dimming */}
      {target && (
        <div
          className="pointer-events-none fixed rounded-2xl outline-2 outline-amber transition-all duration-300"
          style={{
            left: target.left - SPOTLIGHT_PAD,
            top: target.top - SPOTLIGHT_PAD,
            width: target.width + 2 * SPOTLIGHT_PAD,
            height: target.height + 2 * SPOTLIGHT_PAD,
            boxShadow: '0 0 0 200vmax rgba(42, 36, 32, 0.38)',
          }}
        />
      )}
      <div
        ref={note}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="glass-surface glass-panel fixed w-[min(20rem,calc(100vw-2rem))] px-5 py-5 outline-none transition-[left,top] duration-300"
        // frosted, not clear like the page's panels: the note often sits over the busy turntable, so
        // it keeps a white tint with dark text on any background
        style={
          {
            left: place?.x ?? -9999,
            top: place?.y ?? -9999,
            '--glass-tint': 'rgba(255, 255, 255, 0.93)',
            '--glass-tint-low': 'rgba(255, 255, 255, 0.84)',
            '--color-ink': '#2a2420',
            '--color-ink-muted': '#6f665b',
          } as React.CSSProperties
        }
      >
        {place && <span className="tour-arrow" data-side={place.side} style={arrowStyle(place)} aria-hidden="true" />}
        <div className="glass-content">
          <p className="text-xs font-semibold tracking-widest text-ink-muted uppercase">
            {index + 1} of {steps.length}
          </p>
          <h2 id="tour-title" className="mt-1.5 font-display text-2xl leading-tight text-ink">
            {step.title}
          </h2>
          <p id="tour-body" className="mt-2 text-sm leading-relaxed text-ink-muted">
            {step.body}
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button type="button" onClick={onClose} className="cursor-pointer text-sm text-ink-muted underline-offset-4 hover:underline">
              {TOUR.skip}
            </button>
            <div className="flex gap-2">
              {index > 0 && (
                <button type="button" onClick={back} className="glass-surface glass-control cursor-pointer px-4 py-1.5 text-sm font-medium text-ink">
                  <span className="glass-content">{TOUR.back}</span>
                </button>
              )}
              <button type="button" onClick={next} className="glass-surface glass-control cursor-pointer px-4 py-1.5 text-sm font-medium text-ink">
                <span className="glass-content">{last ? TOUR.done : TOUR.next}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The first side with room for the note (below, above, right, left), kept inside the window; the
 *  arrow points at the target's centre. A target too big for any side gets the note over its bottom. */
function placeNote(target: DOMRect, note: { width: number; height: number }): Placement {
  const { innerWidth: width, innerHeight: height } = window
  const centreX = target.left + target.width / 2
  const centreY = target.top + target.height / 2
  const sides: (Placement & { fits: boolean })[] = [
    { side: 'below', x: centreX - note.width / 2, y: target.bottom + GAP, arrow: 0, fits: target.bottom + GAP + note.height < height - EDGE },
    { side: 'above', x: centreX - note.width / 2, y: target.top - GAP - note.height, arrow: 0, fits: target.top - GAP - note.height > EDGE },
    { side: 'right', x: target.right + GAP, y: centreY - note.height / 2, arrow: 0, fits: target.right + GAP + note.width < width - EDGE },
    { side: 'left', x: target.left - GAP - note.width, y: centreY - note.height / 2, arrow: 0, fits: target.left - GAP - note.width > EDGE },
  ]
  const chosen = sides.find((side) => side.fits) ?? { ...sides[1], y: Math.min(target.bottom, height) - note.height - GAP }
  const x = clamp(chosen.x, EDGE, width - note.width - EDGE)
  const y = clamp(chosen.y, EDGE, height - note.height - EDGE)
  const vertical = chosen.side === 'below' || chosen.side === 'above'
  const arrow = vertical ? clamp(centreX - x, 22, note.width - 22) : clamp(centreY - y, 22, note.height - 22)
  return { side: chosen.side, x, y, arrow }
}

/** The arrow sits on the note's edge nearest the target, pointing at it (the shapes are in glass.css). */
function arrowStyle({ side, arrow }: Placement): React.CSSProperties {
  if (side === 'below') return { left: arrow, top: 0 }
  if (side === 'above') return { left: arrow, top: '100%' }
  if (side === 'right') return { top: arrow, left: 0 }
  return { top: arrow, left: '100%' }
}

function sameRect(a: DOMRect, b: DOMRect): boolean {
  return Math.round(a.left) === Math.round(b.left) && Math.round(a.top) === Math.round(b.top) && Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}
