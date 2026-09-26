import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Turntable from '../components/Turntable/Turntable'
import Microphone from '../components/Microphone/Microphone'
import ModeButtons from '../components/Turntable/ModeButtons'
import NoteStream from '../components/NoteStream/NoteStream'
import AdjustmentsPanel from '../components/AdjustmentsPanel/AdjustmentsPanel'
import NotesGraph from '../components/NotesGraph/NotesGraph'
import GlassButton from '../components/GlassButton/GlassButton'
import GlassMessage from '../components/GlassMessage/GlassMessage'
import { useRecordSession } from '../hooks/useRecordSession'
import { useMode } from '../hooks/useMode'
import { useSongSettings } from '../hooks/useSongSettings'
import { useHoldToRecord } from '../hooks/useHoldToRecord'
import { useSongPlayer } from '../hooks/useSongPlayer'
import { useTalk } from '../hooks/useTalk'
import { appear } from '../design/motion'
import {
  ACCOMPANIMENT_HELP,
  ANNOUNCEMENTS,
  MIC_HELP,
  UPLOAD_FAILED_TITLE,
  UPLOAD_HELP,
  discLabel,
  micCaption,
  micLabel,
  talkCaption,
} from './homeCopy'

/**
 * The turntable scene: the header top-left, the turntable centered with the microphone below
 * it. Once a hum presses and uploads successfully, the turntable settles into a top-down
 * birdview and the adjustments panel fades in beneath it. Narrow screens stack it all the same
 * way.
 */
export default function HomePage() {
  const reducedMotion = useReducedMotion() ?? false
  const { settings, update } = useSongSettings()
<<<<<<< HEAD
  const { phase, micProblem, uploadFailure, accompanimentFailure } = session
=======
  const session = useRecordSession(reducedMotion, settings)
  const { mode, setMode } = useMode()
  const { phase, micProblem, uploadFailure } = session
  const talk = useTalk({ settings, update, remakeSong: session.remakeSong })
  const talking = mode === 'talk' && phase === 'ready'
  const canTalk = talking && !talk.busy

  // the song plays while the record turns, and waits while someone talks to it
  useSongPlayer(session.song, phase === 'ready' && !session.paused && !talk.busy)
>>>>>>> fe663df (bugs fixed, elevenlabs)

  const hold = useHoldToRecord({
    enabled: mode === 'talk' ? canTalk : phase === 'idle' || phase === 'recording',
    onPress: () => {
      // talk mode: listen, then the faders move and the song is remade from the same hum
      if (mode === 'talk') void talk.listen()
      else if (phase === 'idle') session.record()
    },
    // released before the mic was ready (e.g. during the permission prompt): the recording
    // keeps going and a tap on the mic stops it
    onRelease: () => {
      if (mode === 'talk') talk.stop()
      else if (phase === 'recording') session.stopRecording()
    },
  })

  const recording = phase === 'recording'
  const adjustable = phase === 'ready'

  return (
    <main className="grid min-h-dvh grid-cols-1 gap-y-6 px-5 py-8 lg:px-12 lg:py-10">
      <header>
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
          topDown={adjustable}
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
            {phase === 'ready' && accompanimentFailure && (
              <motion.p key="accompaniment-failed" className="glass-surface glass-control h-fit px-5 py-2 text-sm text-ink" {...appear}>
                <span className="glass-content">{ACCOMPANIMENT_HELP[accompanimentFailure.kind]}</span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* the mode keys sit left of the mic and Re-record right of it, both measured from the mic's
            centre line, so a long caption under the mic doesn't push them around */}
        <div className="relative">
          <div className="absolute top-1/4 right-[calc(50%+var(--mic-size)*0.55+1rem)]">
            <ModeButtons mode={mode} onChange={setMode} />
          </div>
          <Microphone
            pointerHandlers={hold.pointerHandlers}
            recording={recording || talk.phase === 'listening'}
            enabled={mode === 'talk' ? canTalk : phase === 'idle' || phase === 'requesting' || recording}
            label={micLabel(mode)}
            caption={
              talking
                ? talkCaption(talk.phase, talk.reply, talk.problem, talk.secondsLeft)
                : micCaption(phase, mode, hold.holding, session.secondsLeft)
            }
          >
            <NoteStream active={recording} level={session.canvas.liveLevel} />
          </Microphone>
          <AnimatePresence>
            {phase === 'ready' && (
              <div className="absolute top-1/3 left-[calc(50%+var(--mic-size)*0.55+1rem)]">
                <GlassButton key="rerecord" onClick={session.reset} {...appear}>
                  Re-record
                </GlassButton>
              </div>
            )}
          </AnimatePresence>
        </div>

        <p className="sr-only" aria-live="polite">
          {(talking && talk.reply) || ANNOUNCEMENTS[phase] || ''}
        </p>

        <AnimatePresence>
          {adjustable && (
            <motion.div key="adjustments" className="mt-8 flex w-full flex-col items-center gap-6" {...appear}>
              <AdjustmentsPanel settings={settings} onChange={update} />
              {session.notes && <NotesGraph notes={session.notes} />}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  )
}
