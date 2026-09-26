import { useEffect, useRef } from 'react'
import { saveRecord, updateRecord } from '../data/records'
import type { SongSettings } from './useSongSettings'

/**
 * Keeps each finished song on the profile page.
 *
 * One record per hum, not per version: the first song made from a hum is saved, and every version
 * after it (a fader moved, a spoken edit) replaces the audio on that same record, so the profile
 * holds the song as it was last left. A new hum starts a new record.
 *
 * Saving is best-effort. A browser with storage blocked still makes songs; it just can't keep them.
 */
export function useKeepRecord(song: Blob | null, settings: SongSettings, ready: boolean) {
  const saved = useRef<{ id: string | null; song: Blob | null }>({ id: null, song: null })
  const latestSettings = useRef(settings)
  useEffect(() => {
    latestSettings.current = settings
  })

  useEffect(() => {
    if (!song) {
      saved.current = { id: null, song: null } // reset or re-record: the next song is a new record
      return
    }
    if (!ready || saved.current.song === song) return
    const first = saved.current.song === null
    saved.current = { ...saved.current, song }

    const keep = async () => {
      if (first) saved.current.id = (await saveRecord(song, latestSettings.current)).id
      else if (saved.current.id) await updateRecord(saved.current.id, song, latestSettings.current)
    }
    void keep().catch((error: Error) => {
      if (import.meta.env.DEV) console.warn('[ECKO records] the record could not be kept:', error.message)
    })
  }, [song, ready])
}
