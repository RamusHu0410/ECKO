import { useState } from 'react'

/** hum: record a hummed tune · talk: describe the song out loud (not built yet) */
export type Mode = 'hum' | 'talk'

/** Which input the turntable's HUM / TALK buttons have selected. */
export function useMode() {
  const [mode, setMode] = useState<Mode>('hum')
  return { mode, setMode }
}
