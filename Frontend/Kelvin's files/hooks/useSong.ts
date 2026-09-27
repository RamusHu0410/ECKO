import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PIPELINE_NOTES_URL, PIPELINE_SONG_URL, TALK_NOTES_URL, fetchNotes, makeSong, type SongNotes } from '../api/talk'
import { UploadError, type HumUpload } from '../api/uploadHum'
import { ENGINE_ORDER, engineSettings, generateSong } from '../api/generateAccompaniment'
import { renderPureHum } from '../audio/pureHum'
import type { SongSettings } from './useSongSettings'

export type SongStatus = 'idle' | 'making' | 'ready' | 'failed'
/** Which version plays: the first orchestral song, the hummed notes alone, or the latest edit (faders, talk, Advanced). */
export type SongVersion = 'epic' | 'hum' | 'edited'

/**
 * The song the backend makes from the hum. Normally one version, shaped entirely by talk mode and
 * the faders; with Advanced on, the three versions the sound slider blends (classical piano, synth,
 * creepy). make() presses the first song after the upload; remake() makes it again from the same
 * hum with new settings and swaps it in once it's ready, so the record keeps its state meanwhile.
 * Turning Advanced on or off makes the song again in the new form.
 *
 * Edits never lose the first song: it's kept as the "epic" version, and choose('epic') plays it
 * again. choose('hum') plays the hummed notes alone (made in the browser, audio/pureHum.ts). A new
 * edit plays as soon as it's ready ("edited"), unless Epic or Pure hum was pressed while it was made.
 */
export function useSong(settings: SongSettings, advanced: boolean) {
  const [status, setStatus] = useState<SongStatus>('idle')
  const [songs, setSongs] = useState<Blob[] | null>(null)
  const [failure, setFailure] = useState<UploadError | null>(null)
  const [notes, setNotes] = useState<SongNotes | null>(null)
  const [epic, setEpic] = useState<Blob | null>(null)
  const [pureHum, setPureHum] = useState<Blob | null>(null)
  const [version, setVersion] = useState<SongVersion>('epic')
  const sungRef = useRef<SongNotes['sung'] | null>(null) // the hummed notes, for the pure-hum version
  // counts each press of Epic or Pure hum: a song still being made when one is pressed doesn't take over
  const choiceRef = useRef(0)
  const humRef = useRef<HumUpload | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const latest = useRef({ settings, advanced })
  useEffect(() => {
    latest.current = { settings, advanced }
  })

  /** Fetches the notes graph for a version once it plays; the song never waits for it. */
  const showNotes = useCallback((hum: string, used: SongSettings) => {
    fetchNotes(hum, used, latest.current.advanced ? TALK_NOTES_URL : PIPELINE_NOTES_URL).then(
      (found) => {
        if (humRef.current?.filename !== hum) return
        setNotes(found)
        if (!sungRef.current && found.sung.length > 0) sungRef.current = found.sung
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
    setEpic(null)
    setPureHum(null)
    sungRef.current = null
    const { settings: used, advanced: blended } = latest.current
    try {
      const made = await songsFor(hum, used, blended, request.signal)
      if (requestRef.current !== request) return
      setSongs(made)
      setEpic(blended ? null : made[0]) // the orchestral first song, kept whatever is edited later
      setVersion(blended ? 'edited' : 'epic')
      setStatus('ready')
      showNotes(hum.filename, used)
      // with Advanced on the blend plays first, and the orchestral song is made alongside for Epic
      if (blended) {
        makeSong(hum.filename, used, request.signal, PIPELINE_SONG_URL).then(
          (song) => requestRef.current === request && setEpic(song),
          () => undefined, // Epic stays greyed out; the blend still plays
        )
      }
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
    const chosen = choiceRef.current
    const made = await songsFor(hum, next, latest.current.advanced)
    if (requestRef.current !== request) return // a new hum replaced this one meanwhile
    setSongs(made)
    if (choiceRef.current === chosen) setVersion('edited') // unless Epic or Pure hum was pressed while it was made
    showNotes(hum.filename, next)
  }, [showNotes])

  /** Plays the first song again, or the hummed notes alone (made the first time they're asked for). */
  const choose = useCallback(async (wanted: 'epic' | 'hum') => {
    const chosen = ++choiceRef.current
    if (wanted === 'epic') {
      if (epic) setVersion('epic')
      return
    }
    const hum = humRef.current
    const sung = sungRef.current
    if (!hum || !sung) return
    if (pureHum) {
      setVersion('hum')
      return
    }
    const made = await renderPureHum(sung)
    if (humRef.current !== hum) return // a new hum replaced this one meanwhile
    setPureHum(made)
    if (choiceRef.current === chosen) setVersion('hum') // unless Epic was pressed meanwhile
  }, [epic, pureHum])

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
    setEpic(null)
    setPureHum(null)
    setVersion('epic')
    sungRef.current = null
  }, [])

  useEffect(() => () => requestRef.current?.abort(), [])

  // what plays: the chosen kept version, or the latest songs (one, or Advanced's three to blend). Each
  // list stays the same until its song changes: the player starts again from the top on every new list.
  const epicList = useMemo(() => (epic ? [epic] : null), [epic])
  const pureHumList = useMemo(() => (pureHum ? [pureHum] : null), [pureHum])
  const playing = (version === 'epic' && epicList) || (version === 'hum' && pureHumList) || songs
  return {
    status,
    songs: playing,
    notes,
    failure,
    version,
    /** The first orchestral song is there (with Advanced on it comes a little after the blend), and the hummed notes have arrived. */
    versions: { epic: epic !== null, hum: notes !== null && notes.sung.length > 0 },
    choose,
    make,
    remake,
    retry,
    reset,
  }
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
