import type { MotionValue } from 'motion/react'
import { motion } from 'motion/react'
import DiscCanvas from './DiscCanvas'
import type { DiscFrame } from '../../drawing/drawDiscFill'

interface PlatterProps {
  /** Platter angle from useTurntable; the mat and the record turn, the reflections don't. */
  rotation: MotionValue<number>
  canvas: Omit<DiscFrame, 'size' | 'look' | 'reducedMotion'>
  reducedMotion: boolean
  /** The disc has become vinyl: the glass fades out and the vinyl sheen fades in. */
  isVinyl: boolean
  /** Tapping pauses and resumes the record while it plays. */
  tappable: boolean
  label: string
  onTap: () => void
}

/**
 * The aluminum platter with the black mat and the disc on it, laid out flat on the top plate
 * (the plate's tilt gives it perspective). The whole platter is the button for pause / resume.
 */
export default function Platter({ rotation, canvas, reducedMotion, isVinyl, tappable, label, onTap }: PlatterProps) {
  return (
    <button
      type="button"
      className="tt-platter"
      style={{ left: '4.4%', top: '6%', width: '65.1%' }}
      aria-label={label}
      aria-disabled={!tappable}
      data-tappable={tappable}
      onClick={tappable ? onTap : undefined}
    >
      <span className="tt-well">
        <motion.span className="absolute inset-0 rounded-full" style={{ rotate: rotation }}>
          <span className="tt-mat" />
          <span className="tt-disc">
            <DiscCanvas {...canvas} reducedMotion={reducedMotion} />
          </span>
        </motion.span>
        <span className="tt-disc" aria-hidden="true">
          <span className="disc-glass" data-hidden={isVinyl} />
          <span className="vinyl-sheen" data-visible={isVinyl} />
        </span>
        <span className="tt-spindle" aria-hidden="true" />
      </span>
    </button>
  )
}
