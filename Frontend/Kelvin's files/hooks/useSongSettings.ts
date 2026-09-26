import { useCallback, useState } from 'react'

/** The three faders. Each runs from 0 (Moody, Slower, Lower) to 1 (Bright, Faster, Higher). */
export type Slider = 'emotion' | 'speed' | 'pitch'

/** One instrument in the song. The backend decides these; the page keeps them and sends them back. */
export interface Instrument {
  name: string
  /** lead plays the tune and the chords; background plays softly underneath */
  role: 'lead' | 'background'
  level: 'soft' | 'normal' | 'loud'
  /** Where it plays: the whole song, or only its first or second half. */
  section: 'all' | 'start' | 'end'
}

export interface SongSettings extends Record<Slider, number> {
  /** A genre asked for in talk mode ("rock", "jazz"), or null. No fader shows it. */
  style: string | null
  /** What plays, changed in talk mode ("add violin behind the piano"). No fader shows them. */
  instruments: Instrument[]
  /** How calm (below 0) or big (above 0) the first and the second half are, from -2 to 2. */
  energy: { start: number; end: number }
}

const SLIDERS: Slider[] = ['emotion', 'speed', 'pitch']
const MIDDLE: SongSettings = {
  emotion: 0.5,
  speed: 0.5,
  pitch: 0.5,
  style: null,
  instruments: [{ name: 'piano', role: 'lead', level: 'normal', section: 'all' }],
  energy: { start: 0, end: 0 },
}

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
