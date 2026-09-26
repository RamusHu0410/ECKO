import { useCallback, useEffect, useRef, useState } from 'react'
import { encodeWav } from '../audio/encodeWav'

/** Longest hum we record. Recording stops on its own at this point. */
export const MAX_RECORDING_MS = 10_000

export type RecorderPhase = 'idle' | 'requesting' | 'recording' | 'pressing' | 'done' | 'error'

/** Why the microphone couldn't start, so the UI can explain how to fix it. */
export type MicProblem = 'blocked' | 'no-microphone' | 'insecure' | 'unsupported' | 'unavailable'

export interface Recorder {
  phase: RecorderPhase
  /** Time recorded so far; frozen once recording stops. */
  elapsedMs: number
  /** 0 → 1 while the glass presses into vinyl. */
  pressProgress: number
  /** The live mic while recording, for level metering. */
  stream: MediaStream | null
  /** The finished recording as a WAV file, ready to send to the backend. */
  audio: Blob | null
  problem: MicProblem | null
  start: () => void
  stop: () => void
}

/**
 * Records up to MAX_RECORDING_MS from the mic, then runs the pressing timer.
 * idle → requesting → recording → pressing → done, or → error if the mic can't start.
 */
export function useRecorder(pressDurationMs: number): Recorder {
  const [phase, setPhase] = useState<RecorderPhase>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [pressProgress, setPressProgress] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [problem, setProblem] = useState<MicProblem | null>(null)

  const phaseRef = useRef<RecorderPhase>('idle')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const frameRef = useRef(0)

  const goTo = useCallback((next: RecorderPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const fail = useCallback(
    (reason: MicProblem) => {
      setProblem(reason)
      goTo('error')
    },
    [goTo],
  )

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    cancelAnimationFrame(frameRef.current)
    recorderRef.current = null
    recorder.stop()
    goTo('pressing')

    const pressedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - pressedAt) / pressDurationMs)
      setPressProgress(progress)
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
      else goTo('done')
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [goTo, pressDurationMs])

  const start = useCallback(async () => {
    const current = phaseRef.current
    if (current === 'requesting' || current === 'recording' || current === 'pressing') return
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail('insecure')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      fail('unsupported')
      return
    }

    cancelAnimationFrame(frameRef.current)
    setAudio(null)
    setElapsedMs(0)
    setPressProgress(0)
    setProblem(null)
    goTo('requesting')

    let micStream: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      fail(classifyMicError(error))
      return
    }

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(micStream)
    } catch {
      micStream.getTracks().forEach((track) => track.stop())
      fail('unsupported')
      return
    }

    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      micStream.getTracks().forEach((track) => track.stop())
      setStream(null)
      encodeWav(new Blob(chunks, { type: recorder.mimeType })).then(setAudio, (error: unknown) =>
        console.error('Could not convert the recording to WAV', error),
      )
    }
    recorder.start()
    recorderRef.current = recorder
    setStream(micStream)
    goTo('recording')

    const startedAt = performance.now()
    const tick = (now: number) => {
      const elapsed = Math.min(MAX_RECORDING_MS, now - startedAt)
      setElapsedMs(elapsed)
      if (elapsed < MAX_RECORDING_MS) frameRef.current = requestAnimationFrame(tick)
      else stop()
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [fail, goTo, stop])

  // release the mic and timers if the page goes away mid-recording
  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
        recorder.stream.getTracks().forEach((track) => track.stop())
      }
    },
    [],
  )

  return { phase, elapsedMs, pressProgress, stream, audio, problem, start, stop }
}

function classifyMicError(error: unknown): MicProblem {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-microphone'
  return 'unavailable'
}
