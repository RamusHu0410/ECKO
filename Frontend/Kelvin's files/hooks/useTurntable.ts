import { useCallback, useEffect, useMemo, useState } from 'react'
import { animate, useAnimationFrame, useMotionValue, type MotionValue } from 'motion/react'
import { readNumberToken } from '../design/readToken'

/** still: stopped · slow: turning while the backend works · full: 33⅓ rpm */
export type PlatterSpeed = 'still' | 'slow' | 'full'

export interface Turntable {
  /** Platter angle in degrees, for a motion element's `rotate`. Changes without re-rendering. */
  rotation: MotionValue<number>
  paused: boolean
  /** At full speed: spin down to a stop, or spin back up. */
  togglePause: () => void
  /** Stop at 0°, unpaused, ready for the next record. */
  rewind: () => void
}

/**
 * The turntable motor. Speed ramps linearly like a real motor: full speed is reached in the
 * spin-up time and lost in the spin-down time, and partial changes take proportionally less.
 * With reduced motion the platter never turns.
 */
export function useTurntable(speed: PlatterSpeed, reducedMotion: boolean): Turntable {
  const timing = useMemo(readTurntableTiming, [])
  const rotation = useMotionValue(0)
  const degreesPerSecond = useMotionValue(0)
  const [paused, setPaused] = useState(false)

  const stopped = reducedMotion || speed === 'still' || (speed === 'full' && paused)
  const target = stopped ? 0 : speed === 'full' ? timing.fullSpeed : timing.slowSpeed

  useEffect(() => {
    const current = degreesPerSecond.get()
    if (current === target) return
    const rampSeconds = target > current ? timing.spinUpSeconds : timing.spinDownSeconds
    const controls = animate(degreesPerSecond, target, {
      duration: (rampSeconds * Math.abs(target - current)) / timing.fullSpeed,
      ease: 'linear',
    })
    return () => controls.stop()
  }, [target, degreesPerSecond, timing])

  useAnimationFrame((_, deltaMs) => {
    const current = degreesPerSecond.get()
    if (current !== 0) rotation.set((rotation.get() + (current * deltaMs) / 1000) % 360)
  })

  const togglePause = useCallback(() => setPaused((wasPaused) => !wasPaused), [])
  const rewind = useCallback(() => {
    degreesPerSecond.jump(0)
    rotation.jump(0)
    setPaused(false)
  }, [degreesPerSecond, rotation])

  return { rotation, paused, togglePause, rewind }
}

function readTurntableTiming() {
  return {
    fullSpeed: 360_000 / readNumberToken('--duration-rotation'),
    slowSpeed: 360_000 / readNumberToken('--duration-rotation-waiting'),
    spinUpSeconds: readNumberToken('--duration-spin-up') / 1000,
    spinDownSeconds: readNumberToken('--duration-spin-down') / 1000,
  }
}
