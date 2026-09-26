import { lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Turntable from '../components/Turntable/Turntable'
import Microphone from '../components/Microphone/Microphone'
import ModeButtons from '../components/Turntable/ModeButtons'
import NoteStream from '../components/NoteStream/NoteStream'
import AdjustmentsPanel from '../components/AdjustmentsPanel/AdjustmentsPanel'
import NotesGraph from '../components/NotesGraph/NotesGraph'
import Intro from '../components/Intro/Intro'
import GlassButton from '../components/GlassButton/GlassButton'
import GlassMessage from '../components/GlassMessage/GlassMessage'
import { useStudio } from '../hooks/useStudio'

/** The 3D turntable loads on its own (three.js is large), so the intro shows at once. */
const Turntable3D = lazy(() => import('../components/Turntable3D/Turntable3D'))
/** Dev switch while the 3D turntable is reviewed: add ?turntable=css to the address for the CSS one. */
const CSS_TURNTABLE = new URLSearchParams(window.location.search).get('turntable') === 'css'
import { appear } from '../design/motion'
import {
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
 * The home page: the intro, then the studio below it. In the studio the turntable is centered
 * with the microphone below it, the HUM / TALK keys to its left and the song's buttons to its
 * right. Once a song is made, the turntable settles into a top-down birdview and the adjustments
 * panel fades in beneath it. Narrow screens stack it all the same way.
 */
export default function HomePage() {
  const studio = useStudio()
  const { session, talk, mode, mic, talking, hasSong, reducedMotion, settings, update } = studio
  const { phase, micProblem, uploadFailure } = session

  return (
    <main>
      <Intro reducedMotion={reducedMotion} />

      {/* the studio, where the recording happens; the intro's links land here (and focus it, so the
          spacebar records straight away) */}
      <section id="studio" tabIndex={-1} aria-label="Studio" className="flex min-h-dvh flex-col items-center px-5 py-10 outline-none lg:px-12">
        {CSS_TURNTABLE ? (
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
            tonearm={{ onRecord: hasSong, reducedMotion }}
            topDown={hasSong}
          />
        ) : (
          <Suspense fallback={<div className="tt3d" />}>
            <Turntable3D
              rotation={session.rotation}
              disc={{ ...session.canvas, reducedMotion }}
              isVinyl={session.isVinyl}
              tappable={phase === 'ready'}
              label={discLabel(phase, session.paused)}
              onTap={session.tap}
              onRecord={hasSong}
              reducedMotion={reducedMotion}
              mode={mode}
              onModeChange={studio.setMode}
              modeLocked={studio.modeLocked}
            />
          </Suspense>
        )}

        {/* status under the turntable: the pressing pill fits without moving anything; a message
            (which needs the room for its buttons) pushes the controls down while it shows */}
        <div className="flex min-h-12 w-full items-start justify-center">
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

        {/* the keys, the mic with its caption, and the song's buttons. A grid, so a long caption (a talk
            reply) wraps inside the middle column instead of spreading over the keys and taking their
            clicks. Narrow screens put the mic on its own row. */}
        <div className="grid w-full max-w-2xl grid-cols-2 items-start gap-x-5 gap-y-4 sm:grid-cols-[1fr_minmax(0,18rem)_1fr]">
          <div className="col-span-2 flex justify-center sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <Microphone
              pointerHandlers={mic.pointerHandlers}
              recording={mic.recording}
              enabled={mic.enabled}
              label={micLabel(mode)}
              caption={
                talking
                  ? talkCaption(talk.phase, talk.reply, talk.problem, talk.secondsLeft)
                  : micCaption(phase, mode, mic.holding, session.secondsLeft, talk.busy)
              }
            >
              <NoteStream active={phase === 'recording'} level={session.canvas.liveLevel} />
            </Microphone>
          </div>
          {/* with the 3D turntable, HUM / TALK are keys on the plinth; these stay for the keyboard and
              screen readers, and show only while one of them has focus */}
          <div
            className={`justify-self-end sm:col-start-1 sm:row-start-1 sm:pt-[calc(var(--mic-size)*0.3)] ${CSS_TURNTABLE ? '' : 'sr-only focus-within:not-sr-only'}`}
          >
            <ModeButtons mode={mode} onChange={studio.setMode} disabled={studio.modeLocked} />
          </div>
          <AnimatePresence>
            {hasSong && (
              <motion.div
                key="song-buttons"
                className="flex flex-col items-start gap-3 justify-self-start sm:col-start-3 sm:row-start-1 sm:pt-[calc(var(--mic-size)*0.12)]"
                {...appear}
              >
                <GlassButton onClick={studio.replay}>Replay</GlassButton>
                <GlassButton onClick={session.reset}>Re-record</GlassButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* what ECKO understood the last command to do, e.g. "✓ Keep piano" and "+ Add violin — soft, in the background" */}
        <AnimatePresence>
          {talking && talk.understood.length > 0 && (
            <motion.ul key="understood" className="glass-surface glass-message mt-3 px-5 py-3 text-xs leading-relaxed text-ink" {...appear}>
              {talk.understood.map((line) => (
                <li key={line} className="glass-content">
                  {line}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <p className="sr-only" aria-live="polite">
          {(talking && talk.reply) || ANNOUNCEMENTS[phase] || ''}
        </p>

        <AnimatePresence>
          {hasSong && (
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
