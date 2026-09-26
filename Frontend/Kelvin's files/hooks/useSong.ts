import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchNotes, makeSong, type SongNotes } from '../api/talk'
import { UploadError } from '../api/uploadHum'
import type { SongSettings } from './useSongSettings'

export type SongStatus = 'idle' | 'making' | 'ready' | 'failed'

/**
 * The song the backend makes from the hum. make() presses the first version after the upload;
 * remake() makes a new version from the same hum with new settings and swaps it in once it's
 * ready, so the record keeps its state (and the faders stay) while it's being made.
 */
export function useSong(settings: SongSettings) {
  const [status, setStatus] = useState<SongStatus>('idle')
  const [song, setSong] = useState<Blob | null>(null)
  const [failure, setFailure] = useState<UploadError | null>(null)
  const [notes, setNotes] = useState<SongNotes | null>(null)
  const humRef = useRef<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  })

  /** Fetches the notes graph for a version once it plays; the song never waits for it. */
  const showNotes = useCallback((hum: string, used: SongSettings) => {
    fetchNotes(hum, used).then(
      (found) => {
        if (humRef.current === hum) setNotes(found)
      },
      (error) => {
        if (import.meta.env.DEV) console.warn('[ECKO notes]', error)
      },
    )
  }, [])

  /** The first version for a newly uploaded hum (`hum` is the filename /upload replied with). */
  const make = useCallback(async (hum: string) => {
    requestRef.current?.abort()
    const request = new AbortController()
    requestRef.current = request
    humRef.current = hum
    setStatus('making')
    setSong(null)
    setFailure(null)
    setNotes(null)
    const used = settingsRef.current
    try {
      const made = await makeSong(hum, used, request.signal)
      if (requestRef.current !== request) return
      setSong(made)
      setStatus('ready')
      showNotes(hum, used)
    } catch (error) {
      if (requestRef.current !== request) return // replaced or reset while in flight
      setFailure(error instanceof UploadError ? error : new UploadError('unexpected', String(error)))
      setStatus('failed')
    }
  }, [showNotes])

  /** A new version from the same hum. Rejects if it couldn't be made; the old version stays. */
  const remake = useCallback(async (next: SongSettings) => {
    const hum = humRef.current
    if (!hum) return
    const made = await makeSong(hum, next)
    if (humRef.current !== hum) return // a new hum replaced this one meanwhile
    setSong(made)
    showNotes(hum, next)
  }, [showNotes])

  const retry = useCallback(() => {
    if (humRef.current) void make(humRef.current)
  }, [make])

  const reset = useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
    humRef.current = null
    setStatus('idle')
    setSong(null)
    setFailure(null)
    setNotes(null)
  }, [])

  useEffect(() => () => requestRef.current?.abort(), [])

  return { status, song, notes, failure, make, remake, retry, reset }
}
