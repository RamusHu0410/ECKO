import { useCallback, useState } from 'react'

/** The three faders. Each runs from 0 (Moody, Slower, Lower) to 1 (Bright, Faster, Higher). */
export type Slider = 'emotion' | 'speed' | 'pitch'

export interface SongSettings extends Record<Slider, number> {
  /** A genre asked for in talk mode ("rock", "jazz"), or null. No fader shows it. */
  style: string | null
  /** Instruments or effects asked for in talk mode ("strings"). No fader shows them. */
  extras: string[]
}

const SLIDERS: Slider[] = ['emotion', 'speed', 'pitch']
const MIDDLE: SongSettings = { emotion: 0.5, speed: 0.5, pitch: 0.5, style: null, extras: [] }

/**
 * How the generated song should feel. The backend makes the song with these (POST /talk/song).
 * One setter serves the faders and talk mode: pass any of the values and the rest stay as they are.
 */
export function useSongSettings() {
  const [settings, setSettings] = useState<SongSettings>(MIDDLE)

  const update = useCallback((changes: Partial<SongSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes }
      for (const name of SLIDERS) next[name] = Math.min(1, Math.max(0, next[name]))
      return next
    })
  }, [])

  return { settings, update }
}
