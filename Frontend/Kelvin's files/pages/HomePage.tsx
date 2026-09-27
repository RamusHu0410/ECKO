import { lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Turntable from '../components/Turntable/Turntable'
import Microphone from '../components/Microphone/Microphone'
import NoteStream from '../components/NoteStream/NoteStream'
import AdjustmentsPanel from '../components/AdjustmentsPanel/AdjustmentsPanel'
import NotesGraph from '../components/NotesGraph/NotesGraph'
import Intro from '../components/Intro/Intro'
import GlassButton from '../components/GlassButton/GlassButton'
import GlassMessage from '../components/GlassMessage/GlassMessage'
import SoundSlider from '../components/SoundSlider/SoundSlider'
import GnomePicker from '../components/GnomePicker/GnomePicker'
import VersionPicker from '../components/VersionPicker/VersionPicker'
import Tour, { useTour } from '../components/Tour/Tour'
import { useStudio } from '../hooks/useStudio'

/** The 3D turntable loads on its own (three.js is large), so the intro shows at once. */
const Turntable3D = lazy(() => import('../components/Turntable3D/Turntable3D'))
/** Dev switch while the 3D turntable is reviewed: add ?turntable=css to the address for the CSS one. */
const CSS_TURNTABLE = new URLSearchParams(window.location.search).get('turntable') === 'css'
import { appear } from '../design/motion'
import {
  ANNOUNCEMENTS,
  GNOME_LABEL,
  MIC_HELP,
  MIC_LABEL,
  UPLOAD_FAILED_TITLE,
  UPLOAD_HELP,
  discLabel,
  micCaption,
  talkCaption,
} from './homeCopy'

/**
 * The home page: the intro, then the studio below it. In the studio the turntable is centered
 * with the microphone below it and the song's buttons to its right; once there's a song, a gnome
 * stands on the turntable, and holding him is how you talk to it. Once a song is made, the turntable settles into a top-down birdview and the adjustments
 * panel fades in beneath it. Narrow screens stack it all the same way.
 */
export default function HomePage() {
  const studio = useStudio()
  const { session, talk, mic, gnome, talking, hasSong, reducedMotion, settings, sound, versions } = studio
  const tour = useTour(hasSong) // plays by itself on a first visit, and when the first song is ready
  const { phase, micProblem, uploadFailure } = session

  return (
    <main>
      <Intro reducedMotion={reducedMotion} onShowGuide={tour.show} />
      {tour.steps && <Tour key={tour.steps.map((step) => step.title).join()} steps={tour.steps} onClose={tour.close} />}

      {/* the studio, where the recording happens; the intro's links land here (and focus it, so the
          spacebar records straight away). Narrow screens stack it all; wide ones set the controls
          beside the turntable so nothing needs scrolling to reach: from 1024px the gnome, the record's
          buttons and Your song share a column on the right, from 1280px the gnome moves to the left.
          Before there's a song the turntable spans the whole width. */}
      <section id="studio" tabIndex={-1} aria-label="Studio" className="min-h-dvh px-5 py-10 outline-none lg:px-10">
        <div className="mx-auto grid w-full max-w-[88rem] grid-cols-1 items-start gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-8 xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
          {/* middle: the turntable, its status line, and the mic */}
          <div
            className={`flex min-w-0 flex-col items-center ${hasSong ? 'lg:col-start-1 lg:row-span-2 lg:row-start-1 xl:col-start-2 xl:row-span-1' : 'lg:col-span-full'}`}
            data-tour="turntable-area"
          >
            <div className="w-full" data-tour="turntable">
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
                    humming={phase === 'recording'}
                    gnome={{
                      present: gnome.present,
                      enabled: gnome.enabled,
                      holding: gnome.holding,
                      phase: gnome.phase,
                      onPress: gnome.press,
                      onRelease: gnome.release,
                      look: gnome.look,
                    }}
                  />
                </Suspense>
              )}
            </div>

            {/* status under the turntable: the pressing pill fits without moving anything; a message
                (which needs the room for its buttons) pushes the mic down while it shows */}
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
                    body={uploadFailure.reason ?? UPLOAD_HELP[uploadFailure.kind].body}
                    detail={!uploadFailure.reason && UPLOAD_HELP[uploadFailure.kind].showDetail ? uploadFailure.message : undefined}
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

            {/* the mic with its caption; the caption (a talk reply) wraps within the mic's width */}
            <div className="flex w-full max-w-72 flex-col items-center gap-3" data-tour="mic">
              <Microphone
                pointerHandlers={mic.pointerHandlers}
                recording={mic.recording}
                enabled={mic.enabled}
                label={MIC_LABEL}
                caption={
                  talking
                    ? talkCaption(talk.phase, talk.reply, talk.problem, talk.secondsLeft)
                    : micCaption(phase, mic.holding, session.secondsLeft, talk.busy)
                }
              >
                <NoteStream active={phase === 'recording'} level={session.canvas.liveLevel} />
              </Microphone>
              {/* the gnome is in the 3D scene, which screen readers and the keyboard skip: this is his
                  button for them, and it shows only while it has focus */}
              {hasSong && (
                <button
                  type="button"
                  className="glass-surface glass-control sr-only px-5 py-2 text-sm text-ink focus-visible:not-sr-only"
                  aria-label={GNOME_LABEL}
                  aria-disabled={!gnome.enabled}
                  {...gnome.keyHandlers}
                >
                  <span className="glass-content">{gnome.holding ? 'Listening…' : 'Hold to talk'}</span>
                </button>
              )}
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
          </div>

          {/* who answers when you talk, and the record's own buttons */}
          <AnimatePresence>
            {hasSong && (
              <motion.aside
                key="gnome-and-record"
                className="mx-auto flex w-full max-w-sm flex-col gap-4 lg:col-start-2 lg:row-start-1 lg:max-w-none xl:col-start-1 xl:pt-12"
                aria-label="Version, gnome and record"
                {...appear}
              >
                <VersionPicker playing={versions.playing} available={versions.available} onChoose={versions.choose} />
                <div className="glass-surface glass-panel px-5 py-5" data-tour="gnome-picker">
                  <div className="glass-content flex flex-col gap-3">
                    <h2 className="text-xs font-semibold tracking-widest text-ink-muted uppercase">Your gnome</h2>
                    <GnomePicker value={gnome.id} disabled={talk.busy} onChange={gnome.choose} compact />
                  </div>
                </div>
                <div className="flex justify-center gap-3" data-tour="song-buttons">
                  <GlassButton onClick={studio.replay}>Replay</GlassButton>
                  <GlassButton onClick={session.reset}>Re-record</GlassButton>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Your song: the faders, Advanced (the sound blend) and Reset */}
          <AnimatePresence>
            {hasSong && (
              <motion.aside
                key="your-song"
                className="mx-auto w-full max-w-sm lg:col-start-2 lg:row-start-2 lg:max-w-none xl:col-start-3 xl:row-start-1 xl:pt-12"
                aria-label="Your song"
                {...appear}
              >
                <AdjustmentsPanel
                  settings={settings}
                  onChange={studio.adjust}
                  advanced={{
                    open: sound.advanced,
                    onToggle: sound.toggleAdvanced,
                    // the sound slider, blending the song anywhere from classical to creepy
                    children: <SoundSlider value={sound.mix} disabled={!sound.blending} onChange={sound.setMix} />,
                  }}
                  reset={{ onReset: studio.resetSettings, disabled: studio.settingsAtMiddle }}
                />
              </motion.aside>
            )}
          </AnimatePresence>

          {/* underneath: the tune as hummed and as played */}
          {hasSong && session.notes && (
            <div className="flex justify-center lg:col-span-2 xl:col-span-3" data-tour="graph">
              <NotesGraph notes={session.notes} />
            </div>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {(talking && talk.reply) || ANNOUNCEMENTS[phase] || ''}
        </p>
      </section>
    </main>
  )
}
