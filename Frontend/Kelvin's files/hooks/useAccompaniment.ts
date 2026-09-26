import { useCallback, useEffect, useRef, useState } from 'react'
import { GenerateError, generateAccompaniment, type GenerateOptions, type MelodyNote } from '../api/generateAccompaniment'

export type AccompanimentStatus = 'idle' | 'generating' | 'ready' | 'failed'

export interface AccompanimentRequest {
  status: AccompanimentStatus
  failure: GenerateError | null
  /** Plays the generated WAV from the start (a no-op before it's ready). */
  play: () => void
  /** Pauses playback where it is. */
  pause: () => void
  /** Cancels any request, stops playback, and forgets the last result. */
  reset: () => void
}

/**
 * Turns a melody into a playable accompaniment: sends it to POST /accompaniment/generate
 * (format=wav), then owns an <audio> element for the resulting WAV blob.
 */
export function useAccompaniment(melody: MelodyNote[] | null, options?: GenerateOptions): AccompanimentRequest {
  const [status, setStatus] = useState<AccompanimentStatus>('idle')
  const [failure, setFailure] = useState<GenerateError | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const teardown = useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
  }, [])

  useEffect(() => {
    teardown()
    setFailure(null)

    if (!melody || melody.length === 0) {
      setStatus('idle')
      return
    }

    const request = new AbortController()
    requestRef.current = request
    setStatus('generating')

    generateAccompaniment(melody, options, request.signal)
      .then((acc) => {
        if (requestRef.current !== request) return // replaced or reset while in flight
        urlRef.current = acc.url
        audioRef.current = new Audio(acc.url)
        setStatus('ready')
      })
      .catch((error) => {
        if (requestRef.current !== request) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setFailure(error instanceof GenerateError ? error : new GenerateError('unexpected', String(error)))
        setStatus('failed')
      })

    return teardown
    // options is passed fresh each render by callers that build it inline; melody identity is what should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [melody, teardown])

  const play = useCallback(() => {
    void audioRef.current?.play()
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const reset = useCallback(() => {
    teardown()
    setStatus('idle')
    setFailure(null)
  }, [teardown])

  return { status, failure, play, pause, reset }
}
