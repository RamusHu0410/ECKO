import type { CSSProperties } from 'react'

/** Each note's own timing and path, so the stream looks loose rather than mechanical. */
const NOTES = [
  { delay: 0, duration: 2.1, drift: -0.1, turn: -18, flag: true },
  { delay: 0.35, duration: 2.5, drift: -0.16, turn: 12, flag: false },
  { delay: 0.7, duration: 1.9, drift: -0.06, turn: -8, flag: false },
  { delay: 1.05, duration: 2.3, drift: -0.2, turn: 20, flag: true },
  { delay: 1.4, duration: 2.0, drift: -0.12, turn: -14, flag: false },
  { delay: 1.75, duration: 2.6, drift: -0.08, turn: 6, flag: true },
]

/** How far the stream climbs (mic to disc) and how far it bends toward the disc, from the plate size. */
const STREAM_STYLE = { '--stream-height': 'calc(var(--plate-w) * 0.5 + 3rem)' } as CSSProperties

interface NoteStreamProps {
  active: boolean
  /** Live mic level, 0–1: louder humming makes the stream bolder. */
  level: number
}

/** Small note shapes and melody lines rising from the microphone into the disc while recording. */
export default function NoteStream({ active, level }: NoteStreamProps) {
  return (
    <div className="note-stream" style={{ ...STREAM_STYLE, opacity: active ? 0.35 + 0.65 * level : 0 }} aria-hidden="true">
      <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 220 200" preserveAspectRatio="none">
        <path className="note-stream-line" d="M112 200 C 96 160, 128 120, 100 80 S 80 30, 86 0" />
        <path className="note-stream-line" style={{ animationDelay: '-1.2s' }} d="M104 200 C 124 150, 88 110, 110 70 S 96 20, 78 0" />
      </svg>
      {NOTES.map((note, index) => (
        <svg
          key={index}
          className="note-stream-note"
          viewBox="0 0 16 24"
          style={
            {
              '--rise-delay': `${note.delay}s`,
              '--rise-duration': `${note.duration}s`,
              '--drift': `calc(var(--plate-w) * ${note.drift})`,
              '--turn': `${note.turn}deg`,
            } as CSSProperties
          }
        >
          <ellipse cx="6" cy="19" rx="5" ry="3.6" transform="rotate(-22 6 19)" fill="currentColor" />
          <path d="M10.4 18 V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          {note.flag && <path d="M10.4 3 C 14 6, 15.5 8.5, 13 12" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
        </svg>
      ))}
    </div>
  )
}
