import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Turntable from '../components/Turntable/Turntable'
import Microphone from '../components/Microphone/Microphone'
import NoteStream from '../components/NoteStream/NoteStream'
import AdjustmentsPanel from '../components/AdjustmentsPanel/AdjustmentsPanel'
import GlassButton from '../components/GlassButton/GlassButton'
import GlassMessage from '../components/GlassMessage/GlassMessage'
import { useRecordSession } from '../hooks/useRecordSession'
import { useMode } from '../hooks/useMode'
import { useSongSettings } from '../hooks/useSongSettings'
import { useHoldToRecord } from '../hooks/useHoldToRecord'
import { appear } from '../design/motion'
import {
  ANNOUNCEMENTS,
  MIC_HELP,
  MIC_LABEL,
  UPLOAD_FAILED_TITLE,
  UPLOAD_HELP,
  discLabel,
  micCaption,
} from './homeCopy'

/**
 * The turntable scene: the header top-left, the turntable in the middle with the microphone
 * below it, and the adjustments panel on the right. Narrow screens stack them in that order.
 */
export default function HomePage() {
  const reducedMotion = useReducedMotion() ?? false
  const session = useRecordSession(reducedMotion)
  const { mode, setMode } = useMode()
  const { settings, update } = useSongSettings()
  const { phase, micProblem, uploadFailure } = session

  const hold = useHoldToRecord({
    enabled: mode === 'talk' || phase === 'idle' || phase === 'recording',
    onPress: () => {
      if (mode === 'talk') {
        // TODO(talk): start a spoken conversation here. It will listen, then shape the song by
        // calling useSongSettings().update({ ... }) with what the person asked for.
        return
      }
      if (phase === 'idle') session.record()
    },
    // released before the mic was ready (e.g. during the permission prompt): the recording
    // keeps going and a tap on the mic stops it
    onRelease: () => {
      if (phase === 'recording') session.stopRecording()
    },
  })

  const recording = phase === 'recording'

  return (
    <main className="grid min-h-dvh grid-cols-1 gap-y-6 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-y-0 lg:px-12 lg:py-10">
      <header className="lg:self-start">
        <h1 className="font-display text-5xl tracking-wide text-ink">ECKO</h1>
        <p className="mt-2 text-lg text-ink">Hum a tune. Get a song.</p>
        <p className="mt-1 max-w-64 text-sm leading-snug text-ink-muted">
          Hum for up to 10 seconds, and we’ll press it into a record.
        </p>
      </header>

      <section aria-label="Turntable" className="flex flex-col items-center justify-center">
        <Turntable
          platter={{
            rotation: session.rotation,
            canvas: session.canvas,
            reducedMotion,
            isVinyl: session.isVinyl,
            tappable: phase === 'ready',
            label: discLabel(phase, session.paused),
            onTap: session.tap,
          }}
          tonearm={{ onRecord: phase === 'ready', reducedMotion }}
          modes={{ mode, onChange: setMode }}
        />

        {/* status under the turntable; messages float here so nothing shifts */}
        <div className="relative z-10 flex h-12 w-full justify-center">
          <AnimatePresence mode="wait">
            {phase === 'waiting' && (
              <motion.p key="waiting" className="glass-surface glass-control h-fit px-5 py-2 text-sm text-ink" {...appear}>
                <span className="glass-content flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-amber motion-safe:animate-pulse" />
                  Pressing your record…
                </span>
              </motion.p>
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
                    <GlassButton onClick={session.reset}>Re-record</GlassButton>
                  </>
                }
              />
            )}
            {phase === 'mic-error' && micProblem && (
              <GlassMessage
                key="mic-help"
                title={MIC_HELP[micProblem].title}
                body={MIC_HELP[micProblem].body}
                actions={<GlassButton onClick={session.reset}>Try again</GlassButton>}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <Microphone
            pointerHandlers={hold.pointerHandlers}
            recording={recording}
            enabled={mode === 'talk' || phase === 'idle' || phase === 'requesting' || recording}
            label={MIC_LABEL}
            caption={micCaption(phase, mode, hold.holding, session.secondsLeft)}
          >
            <NoteStream active={recording} level={session.canvas.liveLevel} />
          </Microphone>
          <AnimatePresence>
            {phase === 'ready' && (
              <div className="absolute top-1/3 left-full ml-4">
                <GlassButton key="rerecord" onClick={session.reset} {...appear}>
                  Re-record
                </GlassButton>
              </div>
            )}
          </AnimatePresence>
        </div>

        <p className="sr-only" aria-live="polite">
          {ANNOUNCEMENTS[phase] ?? ''}
        </p>
      </section>

      <aside aria-label="Adjustments" className="flex justify-center lg:items-center lg:justify-end">
        <AdjustmentsPanel settings={settings} onChange={update} />
      </aside>
    </main>
  )
}
