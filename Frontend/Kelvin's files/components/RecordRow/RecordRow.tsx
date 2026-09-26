import { useMemo, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { readPressMotion } from '../../design/readToken'

interface RecordRowProps {
  title: string
  /** The line under the title: who made it and when, or how long ago. */
  detail: string
  seconds: number
  playing: boolean
  /** Null when there is nothing to play yet (a shared record with no audio). */
  onPlay: (() => void) | null
  /** The like button on the social feed; the profile has none. */
  children?: ReactNode
}

/** "1:04", or "—" when the length isn't known. */
export function asLength(seconds: number): string {
  if (!seconds) return '—'
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * One record in a list: a play button shaped like a small disc, the title and a line about it,
 * how long it lasts, and whatever the page puts on the right (a like, for the feed).
 */
export default function RecordRow({ title, detail, seconds, playing, onPlay, children }: RecordRowProps) {
  const reducedMotion = useReducedMotion()
  const press = useMemo(readPressMotion, [])

  return (
    <li className="glass-surface glass-panel flex items-center gap-4 px-4 py-3">
      <div className="glass-content flex w-full items-center gap-4">
        <motion.button
          type="button"
          onClick={onPlay ?? undefined}
          disabled={!onPlay}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-page disabled:cursor-default disabled:opacity-35"
          whileTap={reducedMotion || !onPlay ? undefined : { scale: press.scale }}
          transition={press.transition}
          aria-label={`${playing ? 'Pause' : 'Play'} ${title}`}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </motion.button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          <p className="truncate text-xs text-ink-muted">{detail}</p>
        </div>

        <span className="shrink-0 text-xs tabular-nums text-ink-muted">{asLength(seconds)}</span>
        {children}
      </div>
    </li>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 translate-x-px" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M7.5 5h3.5v14H7.5zM13 5h3.5v14H13z" />
    </svg>
  )
}
