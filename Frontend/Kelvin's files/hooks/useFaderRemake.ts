import { useCallback, useEffect, useRef } from 'react'
import type { SongSettings } from './useSongSettings'

/** Dragging a fader fires a change per pixel; wait for it to settle before asking for a new song. */
const SETTLE_MS = 450

/**
 * Makes the song again after a fader has been moved and let go.
 *
 * Talk mode already remakes the song itself once it knows what was asked for, so only the faders
 * come through here. A failure is ignored on purpose: the song that is playing keeps playing, the
 * same way a failed talk edit leaves it alone.
 */
export function useFaderRemake(settings: SongSettings, remakeSong: (settings: SongSettings) => Promise<void>, enabled: boolean) {
  const latest = useRef({ settings, remakeSong, enabled })
  useEffect(() => {
    latest.current = { settings, remakeSong, enabled }
  })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const { settings: now, remakeSong: remake, enabled: allowed } = latest.current
      if (allowed) void remake(now).catch(() => undefined)
    }, SETTLE_MS)
  }, [])
}
