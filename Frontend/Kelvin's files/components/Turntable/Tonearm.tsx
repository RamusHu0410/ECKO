import { useMemo } from 'react'
import { motion } from 'motion/react'
import { readNumberToken } from '../../design/readToken'

/*
 * Geometry, in thousandths of the plate width. The pivot sits at the plate's back-right; at rest
 * the arm points straight to the front and lies on its rest post. Swinging 35° clockwise puts
 * the stylus on the record's outer grooves (worked out from where Platter places the record).
 */
const VIEW_BOX = '-110 -150 220 710'
const BOX = { left: '75%', top: '-3.2%', width: '22%', height: '95.9%' }
const PIVOT_ORIGIN = '50% 21.13%'
const PLAY_ANGLE = 35
const EASE_SWING = [0.45, 0, 0.2, 1] as const

interface TonearmProps {
  /** On the record (playing or paused) or back on its rest. */
  onRecord: boolean
  reducedMotion: boolean
}

/** A brushed-metal tonearm: pivot base, counterweight, arm tube and headshell. */
export default function Tonearm({ onRecord, reducedMotion }: TonearmProps) {
  const swingSeconds = useMemo(() => readNumberToken('--duration-tonearm') / 1000, [])

  return (
    <>
      {/* the parts that stay still: pivot base and arm rest */}
      <svg className="tt-arm" style={BOX} viewBox={VIEW_BOX} aria-hidden="true">
        <defs>
          <radialGradient id="tonearm-base" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" style={{ stopColor: 'var(--metal-light)' }} />
            <stop offset="1" style={{ stopColor: 'var(--metal-dark)' }} />
          </radialGradient>
        </defs>
        <circle r="70" fill="url(#tonearm-base)" />
        <circle r="46" fill="none" stroke="var(--metal-dark)" strokeOpacity="0.5" strokeWidth="3" />
        <rect x="18" y="420" width="26" height="34" rx="6" fill="url(#tonearm-base)" />
      </svg>

      {/* the arm itself, which swings about the pivot */}
      <motion.div
        className="tt-arm"
        style={{ ...BOX, transformOrigin: PIVOT_ORIGIN }}
        initial={false}
        animate={{ rotate: onRecord ? PLAY_ANGLE : 0 }}
        transition={{ duration: reducedMotion ? 0 : swingSeconds, ease: EASE_SWING }}
      >
        <svg className="size-full overflow-visible" viewBox={VIEW_BOX} aria-hidden="true">
          <defs>
            <linearGradient id="tonearm-metal" x1="0" x2="1">
              <stop offset="0" style={{ stopColor: 'var(--metal-dark)' }} />
              <stop offset="0.45" style={{ stopColor: 'var(--metal-light)' }} />
              <stop offset="1" style={{ stopColor: 'var(--metal-mid)' }} />
            </linearGradient>
          </defs>
          {/* counterweight behind the pivot */}
          <rect x="-34" y="-140" width="68" height="78" rx="12" fill="url(#tonearm-metal)" />
          <rect x="-34" y="-102" width="68" height="4" fill="var(--metal-dark)" opacity="0.6" />
          {/* arm tube with a gentle bend toward the headshell */}
          <path d="M0 -60 L0 440 L-18 492" fill="none" stroke="url(#tonearm-metal)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          <circle r="30" fill="url(#tonearm-metal)" />
          <circle r="9" fill="var(--metal-dark)" />
          {/* headshell with the cartridge, angled like a real one */}
          <g transform="translate(-24 510) rotate(20)">
            <rect x="-22" y="-26" width="44" height="58" rx="6" fill="url(#tonearm-metal)" />
            <rect x="-14" y="6" width="28" height="22" rx="3" fill="var(--color-mat)" />
          </g>
        </svg>
      </motion.div>
    </>
  )
}
