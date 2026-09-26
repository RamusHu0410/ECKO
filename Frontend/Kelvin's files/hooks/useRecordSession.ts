import { useCallback, useEffect, useMemo } from 'react'
import { MAX_RECORDING_MS, useRecorder, type RecorderPhase } from './useRecorder'
import { LEVEL_SAMPLE_MS, useMicLevel } from './useMicLevel'
import { useHumUpload, type UploadStatus } from './useHumUpload'
import { useSong, type SongStatus } from './useSong'
import { useTurntable, type PlatterSpeed } from './useTurntable'
import { readNumberToken } from '../design/readToken'
import type { SongSettings } from './useSongSettings'

/**
 * What the disc shows. After pressing, the record waits (turning slowly) while the backend saves
 * the hum and makes its song, then is ready (full speed, the song plays, tap to pause) or failed
 * (Try again resends the same hum, or asks for its song again).
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

/** One hum from start to finish: record → press into vinyl → send to the backend → make its song → spin. */
export function useRecordSession(reducedMotion: boolean, settings: SongSettings) {
  const pressDurationMs = useMemo(() => readNumberToken('--duration-press-vinyl'), [])
  const recorder = useRecorder(pressDurationMs)
  const mic = useMicLevel(recorder.stream)
  const upload = useHumUpload()
  const song = useSong(settings)
  const phase = sessionPhase(recorder.phase, upload.status, song.status)
  const turntable = useTurntable(PLATTER_SPEED[phase], reducedMotion)

  // each finished recording is sent once, while the pressing animation plays
  const { send } = upload
  useEffect(() => {
    if (recorder.recording) send(recorder.recording)
  }, [recorder.recording, send])

  const { prime } = mic
  const { reset: resetUpload } = upload
  // each saved hum gets its song made right away, with the settings as they are
  const { make } = song
  useEffect(() => {
    if (upload.reply) void make(upload.reply.filename)
  }, [upload.reply, make])

  const { reset: resetSong } = song
  const { rewind, togglePause } = turntable
  const { start, stop, reset: resetRecorder } = recorder

  const record = useCallback(() => {
    prime() // inside the tap: iOS only starts audio from a user gesture
    resetUpload()
    resetSong()
    rewind()
    start()
  }, [prime, resetUpload, resetSong, rewind, start])

  /** Back to an empty glass disc (tonearm home, upload and song forgotten), ready for the next hum. */
  const reset = useCallback(() => {
    resetUpload()
    resetSong()
    rewind()
    resetRecorder()
  }, [resetUpload, resetSong, rewind, resetRecorder])

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
    uploadFailure: upload.failure ?? song.failure,
    /** The song to play on the record (null until it's made). */
    song: song.song,
    /** What the notes graph shows for the playing version (null until it arrives). */
    notes: song.notes,
    /** Makes the song again from the same hum with new settings; the old one plays until then. */
    remakeSong: song.remake,
    tap,
    record,
    /** Ends the recording now (hold-to-record releases the mic). */
    stopRecording: stop,
    reset,
    retry: upload.status === 'failed' ? upload.retry : song.retry,
  }
}

function sessionPhase(recorder: RecorderPhase, upload: UploadStatus, song: SongStatus): SessionPhase {
  if (recorder === 'error') return 'mic-error'
  if (recorder !== 'done') return recorder
  if (upload === 'failed' || song === 'failed') return 'failed'
  if (upload === 'sent' && song === 'ready') return 'ready'
  return 'waiting'
}
