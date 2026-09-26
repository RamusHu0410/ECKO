import { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import GlassPanel from '../GlassPanel/GlassPanel'
import GlassButton from '../GlassButton/GlassButton'
import GlassMessage from '../GlassMessage/GlassMessage'
import DiscCanvas from './DiscCanvas'
import { ANNOUNCEMENTS, MIC_HELP, UPLOAD_FAILED_TITLE, UPLOAD_HELP, discLabel } from './discCopy'
import { useRecordSession } from '../../hooks/useRecordSession'
import { readPressMotion } from '../../design/readToken'
import { appear } from '../../design/motion'

/**
 * The hero: a glass disc you tap to hum into. It presses itself into vinyl, turns slowly while
 * the backend works, then spins at 33⅓ rpm (tap to pause). Returns three rows for the page grid:
 * the disc, a screen-reader status line and the actions area below the disc.
 */
export default function RecordDisc() {
  const reducedMotion = useReducedMotion() ?? false
  const press = useMemo(readPressMotion, [])
  const session = useRecordSession(reducedMotion)
  const { phase, micProblem, uploadFailure } = session

  return (
    <>
      <motion.button
        type="button"
        aria-label={discLabel(phase, session.paused)}
        aria-disabled={!session.canTap}
        className="relative size-(--size-disc) cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber aria-disabled:cursor-default"
        onClick={session.tap}
        whileTap={session.canTap && !reducedMotion ? { scale: press.scale } : undefined}
        transition={press.transition}
      >
        <GlassPanel className="size-full">
          <motion.div className="absolute inset-0 rounded-full" style={{ rotate: session.rotation }}>
            <DiscCanvas {...session.canvas} reducedMotion={reducedMotion} />
          </motion.div>
          <span className="vinyl-sheen" data-visible={session.isVinyl} />
          {!session.isVinyl && (
            // a small frosted chip, nested glass on the clear disc, so the dark text stays readable
            <span className="absolute inset-x-0 top-[57%] flex justify-center" aria-hidden="true">
              <span className="glass-surface glass-control px-[1em] py-[0.35em] text-disc tracking-wide text-ink tabular-nums">
                <span className="glass-content flex items-center gap-[0.5em]">
                  {phase === 'recording' && <span className="size-[0.45em] rounded-full bg-amber motion-safe:animate-pulse" />}
                  {phase === 'recording'
                    ? `0:${String(session.secondsLeft).padStart(2, '0')}`
                    : phase === 'requesting'
                      ? 'Allow the microphone'
                      : 'Tap and hum'}
                </span>
              </span>
            </span>
          )}
        </GlassPanel>
      </motion.button>

      <p className="sr-only" aria-live="polite">
        {ANNOUNCEMENTS[phase] ?? ''}
      </p>

      <div className="flex min-h-24 flex-col items-center self-start pt-[clamp(1rem,3vh,2rem)]">
        <AnimatePresence mode="wait">
          {phase === 'waiting' && (
            <motion.p key="waiting" className="glass-surface glass-control px-5 py-2 text-sm text-ink" {...appear}>
              <span className="glass-content flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-amber motion-safe:animate-pulse" />
                Pressing your record…
              </span>
            </motion.p>
          )}
          {phase === 'ready' && (
            <GlassButton key="rerecord" onClick={session.record} {...appear}>
              Re-record
            </GlassButton>
          )}
          {phase === 'failed' && uploadFailure && (
            <GlassMessage
              key="upload-failed"
              title={UPLOAD_FAILED_TITLE}
              body={UPLOAD_HELP[uploadFailure.kind].body}
              detail={UPLOAD_HELP[uploadFailure.kind].showDetail ? uploadFailure.message : undefined}
              actions={
                <>
                  <GlassButton onClick={session.retry}>Try again</GlassButton>
                  <GlassButton onClick={session.record}>Re-record</GlassButton>
                </>
              }
            />
          )}
          {phase === 'mic-error' && micProblem && (
            <GlassMessage
              key="mic-help"
              title={MIC_HELP[micProblem].title}
              body={MIC_HELP[micProblem].body}
              actions={<GlassButton onClick={session.record}>Try again</GlassButton>}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
