import { useCallback, useEffect, useMemo } from 'react'
import { MAX_RECORDING_MS, useRecorder, type RecorderPhase } from './useRecorder'
import { LEVEL_SAMPLE_MS, useMicLevel } from './useMicLevel'
import { useHumUpload, type UploadStatus } from './useHumUpload'
import { useTurntable, type PlatterSpeed } from './useTurntable'
import { readNumberToken } from '../design/readToken'

/**
 * What the disc shows. After pressing, the record waits (turning slowly) while the backend
 * works, then is ready (full speed, tap to pause) or failed (Try again resends the same hum).
 */
export type SessionPhase =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'pressing'
  | 'waiting'
  | 'ready'
  | 'failed'
  | 'mic-error'

const LEVELS_PER_RECORDING = MAX_RECORDING_MS / LEVEL_SAMPLE_MS
const TAPPABLE: ReadonlySet<SessionPhase> = new Set(['idle', 'recording', 'ready', 'mic-error'])
const VINYL: ReadonlySet<SessionPhase> = new Set(['pressing', 'waiting', 'ready', 'failed'])
const PLATTER_SPEED: Record<SessionPhase, PlatterSpeed> = {
  idle: 'still',
  requesting: 'still',
  recording: 'still',
  pressing: 'still',
  waiting: 'slow',
  ready: 'full',
  failed: 'still',
  'mic-error': 'still',
}

/** One hum from start to finish: record → press into vinyl → send to the backend → spin. */
export function useRecordSession(reducedMotion: boolean) {
  const pressDurationMs = useMemo(() => readNumberToken('--duration-press-vinyl'), [])
  const recorder = useRecorder(pressDurationMs)
  const mic = useMicLevel(recorder.stream)
  const upload = useHumUpload()
  const phase = sessionPhase(recorder.phase, upload.status)
  const turntable = useTurntable(PLATTER_SPEED[phase], reducedMotion)

  // each finished recording is sent once, while the pressing animation plays
  const { send } = upload
  useEffect(() => {
    if (recorder.recording) send(recorder.recording)
  }, [recorder.recording, send])

  const { prime } = mic
  const { reset: resetUpload } = upload
  const { rewind, togglePause } = turntable
  const { start, stop } = recorder

  const record = useCallback(() => {
    prime() // inside the tap: iOS only starts audio from a user gesture
    resetUpload()
    rewind()
    start()
  }, [prime, resetUpload, rewind, start])

  const tap = useCallback(() => {
    if (phase === 'recording') stop()
    else if (phase === 'ready') togglePause()
    else if (phase === 'idle' || phase === 'mic-error') record()
  }, [phase, record, stop, togglePause])

  return {
    phase,
    canTap: TAPPABLE.has(phase),
    isVinyl: VINYL.has(phase),
    secondsLeft: Math.ceil((MAX_RECORDING_MS - recorder.elapsedMs) / 1000),
    canvas: {
      fillProgress: recorder.elapsedMs / MAX_RECORDING_MS,
      levels: mic.history,
      levelsPerRecording: LEVELS_PER_RECORDING,
      liveLevel: mic.level,
      pressProgress: recorder.pressProgress,
    },
    rotation: turntable.rotation,
    paused: turntable.paused,
    micProblem: recorder.problem,
    uploadFailure: upload.failure,
    tap,
    record,
    retry: upload.retry,
  }
}

function sessionPhase(recorder: RecorderPhase, upload: UploadStatus): SessionPhase {
  if (recorder === 'error') return 'mic-error'
  if (recorder !== 'done') return recorder
  if (upload === 'sent') return 'ready'
  if (upload === 'failed') return 'failed'
  return 'waiting'
}
