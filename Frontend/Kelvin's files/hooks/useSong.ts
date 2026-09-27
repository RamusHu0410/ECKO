import { useCallback, useEffect, useRef, useState } from 'react'
import { PIPELINE_SONG_URL, fetchNotes, makeSong, type SongNotes } from '../api/talk'
import { UploadError, type HumUpload } from '../api/uploadHum'
import { ENGINE_ORDER, engineSettings, generateSong } from '../api/generateAccompaniment'
import type { SongSettings } from './useSongSettings'

export type SongStatus = 'idle' | 'making' | 'ready' | 'failed'

/**
 * The song the backend makes from the hum. Normally one version, shaped entirely by talk mode and
 * the faders; with Advanced on, the three versions the sound slider blends (classical piano, synth,
 * creepy). make() presses the first song after the upload; remake() makes it again from the same
 * hum with new settings and swaps it in once it's ready, so the record keeps its state meanwhile.
 * Turning Advanced on or off makes the song again in the new form.
 */
export function useSong(settings: SongSettings, advanced: boolean) {
  const [status, setStatus] = useState<SongStatus>('idle')
  const [songs, setSongs] = useState<Blob[] | null>(null)
  const [failure, setFailure] = useState<UploadError | null>(null)
  const [notes, setNotes] = useState<SongNotes | null>(null)
  const humRef = useRef<HumUpload | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const latest = useRef({ settings, advanced })
  useEffect(() => {
    latest.current = { settings, advanced }
  })

  /** Fetches the notes graph for a version once it plays; the song never waits for it. */
  const showNotes = useCallback((hum: string, used: SongSettings) => {
    fetchNotes(hum, used).then(
      (found) => {
        if (humRef.current?.filename === hum) setNotes(found)
      },
      (error) => {
        if (import.meta.env.DEV) console.warn('[ECKO notes]', error)
      },
    )
  }, [])

  const fail = useCallback((error: unknown) => {
    setSongs(null)
    setFailure(error instanceof UploadError ? error : new UploadError('unexpected', String(error)))
    setStatus('failed')
  }, [])

  /** The first song for a newly uploaded hum (`hum` is the reply /upload sent). */
  const make = useCallback(async (hum: HumUpload) => {
    requestRef.current?.abort()
    const request = new AbortController()
    requestRef.current = request
    humRef.current = hum
    setStatus('making')
    setSongs(null)
    setFailure(null)
    setNotes(null)
    const { settings: used, advanced: blended } = latest.current
    try {
      const made = await songsFor(hum, used, blended, request.signal)
      if (requestRef.current !== request) return
      setSongs(made)
      setStatus('ready')
      showNotes(hum.filename, used)
    } catch (error) {
      if (requestRef.current !== request) return // replaced or reset while in flight
      fail(error)
    }
  }, [showNotes, fail])

  /** The song again from the same hum with new settings. Rejects if it couldn't be made; the old one stays. */
  const remake = useCallback(async (next: SongSettings) => {
    const hum = humRef.current
    const request = requestRef.current
    if (!hum) return
    const made = await songsFor(hum, next, latest.current.advanced)
    if (requestRef.current !== request) return // a new hum replaced this one meanwhile
    setSongs(made)
    showNotes(hum.filename, next)
  }, [showNotes])

  // Advanced switched: a song that's playing is made again in the new form; one being made starts over
  const shownAdvanced = useRef(advanced)
  useEffect(() => {
    if (shownAdvanced.current === advanced) return
    shownAdvanced.current = advanced
    const hum = humRef.current
    if (!hum) return
    if (status === 'making') void make(hum)
    else if (status === 'ready') {
      remake(latest.current.settings).catch((error) => {
        if (humRef.current === hum) fail(error)
      })
    }
  }, [advanced, status, make, remake, fail])

  const retry = useCallback(() => {
    if (humRef.current) void make(humRef.current)
  }, [make])

  const reset = useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
    humRef.current = null
    setStatus('idle')
    setSongs(null)
    setFailure(null)
    setNotes(null)
  }, [])

  useEffect(() => () => requestRef.current?.abort(), [])

  return { status, songs, notes, failure, make, remake, retry, reset }
}

/**
 * The song for these settings: the audio pipeline's one version (/pipeline/song: the hum's melody,
 * orchestrated), or with Advanced on the three the sound slider blends, in ENGINE_ORDER.
 * /talk/song makes the piano and synth versions with all of talk mode's extras; only
 * /accompaniment/generate has the creepy soundfont, so it makes that one.
 */
async function songsFor(hum: HumUpload, settings: SongSettings, advanced: boolean, signal?: AbortSignal): Promise<Blob[]> {
  if (!advanced) return [await makeSong(hum.filename, settings, signal, PIPELINE_SONG_URL)]
  return Promise.all(
    ENGINE_ORDER.map((engine) =>
      engine === 'creepy'
        ? generateSong(hum, engine, settings, signal)
        : makeSong(hum.filename, { ...settings, ...engineSettings(settings, engine) }, signal),
    ),
  )
}
