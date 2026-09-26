import type { ReactNode } from 'react'

interface MicrophoneProps {
  /** Pointer handlers from useHoldToRecord. */
  pointerHandlers: object
  recording: boolean
  enabled: boolean
  /** Accessible name, e.g. how to hold it. */
  label: string
  /** Line under the mic: "Hold to hum", the countdown, or a note. */
  caption: string
  /** Rendered above the mic (the notes rising into the disc). */
  children?: ReactNode
}

/** A vintage studio microphone on a small stand: the main control. Hold to hum. */
export default function Microphone({ pointerHandlers, recording, enabled, label, caption, children }: MicrophoneProps) {
  return (
    <div className="relative flex flex-col items-center gap-2">
      {children}
      <button
        type="button"
        className="mic"
        aria-label={label}
        aria-disabled={!enabled}
        data-recording={recording}
        {...pointerHandlers}
      >
        <svg viewBox="0 0 120 184" aria-hidden="true">
          <defs>
            <linearGradient id="mic-chrome" x1="0" x2="1">
              <stop offset="0" style={{ stopColor: 'var(--color-chrome-dark)' }} />
              <stop offset="0.32" style={{ stopColor: 'var(--color-chrome-light)' }} />
              <stop offset="0.62" style={{ stopColor: 'var(--color-chrome-mid)' }} />
              <stop offset="1" style={{ stopColor: 'var(--color-chrome-dark)' }} />
            </linearGradient>
            <clipPath id="mic-capsule">
              <rect x="24" y="8" width="72" height="92" rx="34" />
            </clipPath>
          </defs>

          {/* stand: base, pole and the yoke that holds the capsule */}
          <ellipse cx="60" cy="172" rx="40" ry="9" fill="url(#mic-chrome)" />
          <rect x="56" y="118" width="8" height="52" rx="3" fill="url(#mic-chrome)" />
          <path d="M18 56 Q18 118 60 118 Q102 118 102 56" fill="none" stroke="url(#mic-chrome)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="18" cy="56" r="6" fill="url(#mic-chrome)" />
          <circle cx="102" cy="56" r="6" fill="url(#mic-chrome)" />

          {/* capsule with its grille */}
          <rect x="24" y="8" width="72" height="92" rx="34" fill="url(#mic-chrome)" />
          <g clipPath="url(#mic-capsule)" stroke="var(--color-chrome-dark)" strokeOpacity="0.55" strokeWidth="1.6">
            {[20, 30, 40, 50, 64, 74, 84, 94].map((y) => (
              <line key={`h${y}`} x1="20" x2="100" y1={y} y2={y} />
            ))}
            {[36, 48, 60, 72, 84].map((x) => (
              <line key={`v${x}`} x1={x} x2={x} y1="4" y2="104" />
            ))}
          </g>
          <rect x="22" y="53" width="76" height="8" rx="3" fill="url(#mic-chrome)" />
          <rect x="24" y="8" width="72" height="92" rx="34" fill="none" stroke="var(--color-chrome-dark)" strokeWidth="1.5" />
        </svg>
      </button>
      <p className="min-h-5 text-center text-sm text-ink" aria-hidden="true">
        {recording && <span className="mr-1.5 inline-block size-2 rounded-full bg-amber align-middle motion-safe:animate-pulse" />}
        {caption}
      </p>
    </div>
  )
}
