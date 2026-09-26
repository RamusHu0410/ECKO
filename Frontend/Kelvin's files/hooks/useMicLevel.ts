import { useCallback, useEffect, useRef, useState } from 'react'

/** How often the loudness is sampled while the mic is live. */
export const LEVEL_SAMPLE_MS = 50

/** Loudness (dBFS) that maps to level 0 and to level 1; humming sits comfortably between. */
const SILENCE_DB = -55
const LOUD_DB = -12
/** How far the level moves toward a new reading when rising and when falling (0–1). */
const ATTACK = 0.55
const RELEASE = 0.18
const ANALYSER_FFT_SIZE = 1024

export interface MicLevel {
  /** Smoothed loudness right now, 0 (silent) to 1 (loud). */
  level: number
  /** One level per sample period since the current stream started, oldest first. */
  history: readonly number[]
  /** Call in the tap handler before asking for the mic: iOS only starts audio from a user gesture. */
  prime: () => void
}

/** Measures the live mic level (RMS from an AnalyserNode) and keeps a history of it. */
export function useMicLevel(stream: MediaStream | null): MicLevel {
  const contextRef = useRef<AudioContext | null>(null)
  const [level, setLevel] = useState(0)
  const [history, setHistory] = useState<readonly number[]>([])

  const prime = useCallback(() => {
    contextRef.current ??= new AudioContext()
    void contextRef.current.resume()
  }, [])

  useEffect(() => {
    if (!stream) return

    const context = (contextRef.current ??= new AudioContext())
    void context.resume()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = ANALYSER_FFT_SIZE
    source.connect(analyser)

    const buffer = new Float32Array(analyser.fftSize)
    let smoothed = 0
    setHistory([])

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer)
      let sumOfSquares = 0
      for (const value of buffer) sumOfSquares += value * value
      const decibels = 20 * Math.log10(Math.sqrt(sumOfSquares / buffer.length) + Number.EPSILON)
      const target = Math.min(1, Math.max(0, (decibels - SILENCE_DB) / (LOUD_DB - SILENCE_DB)))
      smoothed += (target - smoothed) * (target > smoothed ? ATTACK : RELEASE)
      setLevel(smoothed)
      setHistory((previous) => [...previous, smoothed])
    }, LEVEL_SAMPLE_MS)

    return () => {
      window.clearInterval(timer)
      source.disconnect()
      setLevel(0)
    }
  }, [stream])

  useEffect(
    () => () => {
      void contextRef.current?.close()
      contextRef.current = null
    },
    [],
  )

  return { level, history, prime }
}
