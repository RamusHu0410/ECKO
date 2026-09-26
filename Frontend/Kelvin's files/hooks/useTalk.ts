import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_RECORDING_MS } from './useRecorder'
import { sendTalk, speechUrl } from '../api/talk'
import type { SongSettings } from './useSongSettings'

/**
 * listening: recording what the person says · thinking: the backend is working it out ·
 * speaking: the reply plays · remaking: the new version of the song is being made
 */
export type TalkPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'remaking'

/**
 * mic: the microphone didn't start · short: a tap, not a command · failed: no answer came back ·
 * service: the backend couldn't hear or understand it (e.g. its ElevenLabs or Gemini key is missing) ·
 * voice: the answer came back but couldn't be spoken · song: the new version couldn't be made
 */
export type TalkProblem = 'mic' | 'short' | 'failed' | 'service' | 'voice' | 'song'

interface TalkOptions {
  settings: SongSettings
  update: (changes: Partial<SongSettings>) => void
  /** Makes the song again from the same hum with these settings. */
  remakeSong: (settings: SongSettings) => Promise<void>
}

const SHORTEST_TALK_MS = 300

/**
 * Talk mode: hold the mic and say how the song should change ("make it faster"). The backend
 * hears it and answers out loud; the faders move and the song is remade from the same hum.
 * Saying "undo" steps back, because every change keeps the version before it.
 */
export function useTalk({ settings, update, remakeSong }: TalkOptions) {
  const [phase, setPhase] = useState<TalkPhase>('idle')
  const [reply, setReply] = useState('')
  const [understood, setUnderstood] = useState<string[]>([])
  const [problem, setProblem] = useState<TalkProblem | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const latest = useRef({ settings, update, remakeSong })
  useEffect(() => {
    latest.current = { settings, update, remakeSong }
  })
  const versions = useRef<SongSettings[]>([]) // earlier versions, newest last
  const stopRecording = useRef<(() => void) | null>(null)
  const letGo = useRef(false)
  const voice = useRef<HTMLAudioElement | null>(null)

  /** Sends what was said, then speaks the answer while the new version of the song is made. */
  const answer = useCallback(async (recording: Blob) => {
    const { settings: before, update, remakeSong } = latest.current
    setPhase('thinking')
    try {
      const turn = await sendTalk(recording, before, versions.current.at(-1) ?? null)
      if (turn.error) console.warn('[ECKO talk] the backend could not answer:', turn.error)
      const changed = turn.changed.length > 0
      if (changed) {
        if (turn.intent === 'undo') versions.current.pop()
        else versions.current.push(before)
        update(turn.settings)
      }
      setReply(turn.reply)
      setUnderstood(turn.understood ?? [])
      setPhase('speaking')
      const remade = changed ? remakeSong(turn.settings).then(() => true, () => false) : Promise.resolve(true)
      voice.current ??= new Audio()
      const spoken = await playToEnd(voice.current, speechUrl(turn.speech_id))
      if (!spoken) console.warn('[ECKO talk] the spoken answer could not be played (is ELEVENLABS_API_KEY set on the backend?)')
      if (changed) setPhase('remaking')
      if (turn.intent === 'error') setProblem('service')
      else if (!spoken) setProblem('voice')
      if (!(await remade)) setProblem('song')
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[ECKO talk]', error)
      setProblem('failed')
    }
    setPhase('idle')
  }, [])

  /** Starts listening (the mic is pressed). */
  const listen = useCallback(async () => {
    letGo.current = false
    setProblem(null)
    setReply('')
    setUnderstood([])
    setElapsedMs(0)
    setPhase('listening')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setProblem('mic')
      setPhase('idle')
      return
    }
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream)
    const startedAt = performance.now()
    let heldMs = 0
    const timer = setInterval(() => {
      setElapsedMs(performance.now() - startedAt)
      if (performance.now() - startedAt >= MAX_RECORDING_MS) stopRecording.current?.()
    }, 100)
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      for (const track of stream.getTracks()) track.stop()
      if (heldMs >= SHORTEST_TALK_MS) return void answer(new Blob(chunks, { type: recorder.mimeType }))
      setProblem('short')
      setPhase('idle')
    }
    stopRecording.current = () => {
      stopRecording.current = null
      heldMs = performance.now() - startedAt
      clearInterval(timer)
      recorder.stop()
    }
    recorder.start()
    if (letGo.current) stopRecording.current() // let go while the browser was asking for the mic
  }, [answer])

  /** Stops listening and sends it (the mic is let go). */
  const stop = useCallback(() => {
    letGo.current = true
    stopRecording.current?.()
  }, [])

  useEffect(() => () => voice.current?.pause(), [])

  return {
    phase,
    /** Listening, answering or remaking: the song waits and the mic can't start a new command. */
    busy: phase !== 'idle',
    reply,
    /** What ECKO understood the last command to do, one line per instrument. */
    understood,
    problem,
    secondsLeft: Math.ceil((MAX_RECORDING_MS - elapsedMs) / 1000),
    listen,
    stop,
  }
}

/** Plays a streamed reply; resolves true when it ends, or false at once if it can't play. */
function playToEnd(audio: HTMLAudioElement, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    audio.onended = () => resolve(true)
    audio.onerror = () => resolve(false)
    audio.src = url
    audio.play().catch(() => resolve(false))
  })
}
