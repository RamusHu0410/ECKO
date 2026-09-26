import { useCallback, useState } from 'react'

/** Each setting runs from 0 (Moody, Slower, Lower) to 1 (Bright, Faster, Higher). */
export interface SongSettings {
  emotion: number
  speed: number
  pitch: number
}

const MIDDLE: SongSettings = { emotion: 0.5, speed: 0.5, pitch: 0.5 }

/**
 * How the generated song should feel. One setter serves the faders now and talk mode later:
 * pass any of the values and the rest stay as they are.
 *
 * TODO(settings): send these with the hum. POST /upload only takes the WAV today; the new
 * POST /accompaniment/generate takes style, tempo and mode, which these could map onto.
 */
export function useSongSettings() {
  const [settings, setSettings] = useState<SongSettings>(MIDDLE)

  const update = useCallback((changes: Partial<SongSettings>) => {
    setSettings((current) => {
      const next = { ...current }
      for (const [name, value] of Object.entries(changes) as [keyof SongSettings, number][]) {
        next[name] = Math.min(1, Math.max(0, value))
      }
      return next
    })
  }, [])

  return { settings, update }
}
