import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import GlassPanel from '../GlassPanel/GlassPanel'
import GlassButton from '../GlassButton/GlassButton'
import DiscCanvas from './DiscCanvas'
import { MAX_RECORDING_MS, useRecorder, type MicProblem, type RecorderPhase } from '../../hooks/useRecorder'
import { LEVEL_SAMPLE_MS, useMicLevel } from '../../hooks/useMicLevel'
import { readNumberToken, readPressMotion } from '../../design/readToken'

const LEVELS_PER_RECORDING = MAX_RECORDING_MS / LEVEL_SAMPLE_MS

const DISC_LABELS: Record<RecorderPhase, string> = {
  idle: 'Start recording. Hum for up to 10 seconds.',
  requesting: 'Waiting for microphone access',
  recording: 'Stop recording',
  pressing: 'Pressing your hum into a record',
  done: 'Your record is ready',
  error: 'Try recording again',
}

const ANNOUNCEMENTS: Partial<Record<RecorderPhase, string>> = {
  recording: 'Recording. Hum now.',
  pressing: 'Pressing your hum into a record.',
  done: 'Your record is ready.',
}

const MIC_HELP: Record<MicProblem, { title: string; body: string }> = {
  blocked: {
    title: 'Your microphone is turned off for this page',
    body: 'Click the icon at the left of the address bar and allow the microphone. On iPhone, open Settings › Safari › Microphone and choose Allow. Then try again.',
  },
  'no-microphone': {
    title: 'No microphone found',
    body: 'Plug in a microphone or headset, or check your sound settings, then try again.',
  },
  insecure: {
    title: 'The microphone needs a secure page',
    body: 'Open this page with an https:// address (or on localhost), then try again.',
  },
  unsupported: {
    title: 'This browser can’t record audio',
    body: 'Open the page in the latest Chrome or Safari and try again.',
  },
  unavailable: {
    title: 'The microphone didn’t start',
    body: 'Another app may be using it. Close that app, then try again.',
  },
}

const APPEAR = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }

interface RecordDiscProps {
  /** Called once for each finished recording, as a WAV file. */
  onRecorded: (audio: Blob) => void
}

/** The hero: a glass disc you tap to hum into, which presses itself into a spinning record. */
export default function RecordDisc({ onRecorded }: RecordDiscProps) {
  const reducedMotion = useReducedMotion() ?? false
  const pressDurationMs = useMemo(() => readNumberToken('--duration-press-vinyl'), [])
  const press = useMemo(readPressMotion, [])
  const recorder = useRecorder(pressDurationMs)
  const mic = useMicLevel(recorder.stream)
  const { phase, problem } = recorder

  const onRecordedRef = useRef(onRecorded)
  useEffect(() => {
    onRecordedRef.current = onRecorded
  })
  useEffect(() => {
    if (recorder.audio) onRecordedRef.current(recorder.audio)
  }, [recorder.audio])

  const canTap = phase === 'idle' || phase === 'recording' || phase === 'error'
  const isVinyl = phase === 'pressing' || phase === 'done'
  const secondsLeft = Math.ceil((MAX_RECORDING_MS - recorder.elapsedMs) / 1000)

  const beginRecording = () => {
    mic.prime()
    recorder.start()
  }
  const handleDiscTap = () => {
    if (phase === 'recording') recorder.stop()
    else if (canTap) beginRecording()
  }

  return (
    <div className="flex flex-col items-center">
      <motion.button
        type="button"
        aria-label={DISC_LABELS[phase]}
        aria-disabled={!canTap}
        className="relative size-(--size-disc) cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber aria-disabled:cursor-default"
        onClick={handleDiscTap}
        whileTap={canTap && !reducedMotion ? { scale: press.scale } : undefined}
        transition={press.transition}
      >
        <GlassPanel shape="disc" className="size-full">
          <div className={`absolute inset-0 rounded-full ${phase === 'done' ? 'vinyl-spin' : ''}`}>
            <DiscCanvas
              fillProgress={recorder.elapsedMs / MAX_RECORDING_MS}
              levels={mic.history}
              levelsPerRecording={LEVELS_PER_RECORDING}
              liveLevel={mic.level}
              pressProgress={recorder.pressProgress}
              reducedMotion={reducedMotion}
            />
          </div>
          <span className="vinyl-sheen" data-visible={isVinyl} />
          {!isVinyl && (
            <span
              className="absolute inset-x-0 top-[57%] flex items-center justify-center gap-1.5 text-sm tracking-wide text-ink-muted tabular-nums"
              aria-hidden="true"
            >
              {phase === 'recording' && <span className="size-1.5 rounded-full bg-amber motion-safe:animate-pulse" />}
              {phase === 'recording'
                ? `0:${String(secondsLeft).padStart(2, '0')}`
                : phase === 'requesting'
                  ? 'Allow the microphone'
                  : 'Tap and hum'}
            </span>
          )}
        </GlassPanel>
      </motion.button>

      <p className="sr-only" aria-live="polite">
        {ANNOUNCEMENTS[phase] ?? ''}
      </p>

      <AnimatePresence mode="wait">
        {phase === 'done' && (
          <GlassButton key="rerecord" variant="action" className="mt-8" onClick={beginRecording} {...APPEAR}>
            Re-record
          </GlassButton>
        )}
        {phase === 'error' && problem && (
          <motion.div key="mic-help" role="alert" className="glass-surface glass-message mt-8 max-w-sm px-6 py-5" {...APPEAR}>
            <div className="glass-content flex flex-col items-center gap-2 text-center">
              <p className="font-medium text-ink">{MIC_HELP[problem].title}</p>
              <p className="text-sm leading-relaxed text-ink-muted">{MIC_HELP[problem].body}</p>
              <GlassButton variant="action" className="mt-3" onClick={beginRecording}>
                Try again
              </GlassButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
