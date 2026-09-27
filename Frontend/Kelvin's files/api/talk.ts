/*
 * Talk mode's calls to the backend, and making the song (Flask, backend/src/app/routes/talk.py):
 *   POST /talk/voice        multipart: the recording in "audio", {settings, previous, character} in "state"
 *   GET  /talk/speech/<id>  the spoken reply, streamed as MP3
 *   POST /talk/song         JSON {hum, settings} → the song as WAV, made from the saved hum
 *   POST /talk/notes        JSON {hum, settings} → the notes heard in the hum and the notes the song plays
 * Like /api/upload, the Vite dev server forwards /api/... to Flask without the /api prefix.
 */
import { TIMEOUT_MS, toHttpFailure, toNetworkFailure } from './uploadHum'
import type { SongSettings } from '../hooks/useSongSettings'
import type { GnomeId } from '../data/gnomes'
import { apiUrl } from './base'

/** What the backend understood from one spoken command, and the settings after it. */
export interface TalkTurn {
  heard: string
  intent: 'adjust' | 'undo' | 'off_topic' | 'unclear' | 'error'
  settings: SongSettings
  /** The settings that changed, e.g. ["speed"]; empty when nothing did. */
  changed: string[]
  /** What an edit did to the song, e.g. ["✓ Keep piano", "+ Add violin — soft, in the background"]; empty when only the faders moved. */
  understood: string[]
  reply: string
  error: string | null
  speech_id: string
}

/** A note: MIDI pitch (60 = middle C; decimals = a little sharp), when it starts and how long it lasts, in seconds. */
export interface Note {
  midi: number
  start: number
  duration: number
}

/**
 * One run of sounding frames from the hum: the pitch as it was actually sung, `step` seconds
 * apart from `start`. A silence ends a segment, so each one is a phrase the graph draws as an
 * unbroken line. `level` is loudness, 0 at the noise gate and 1 at the loudest frame.
 */
export interface ContourSegment {
  start: number
  midi: number[]
  level: number[]
}

/** The hum's pitch frame by frame (backend: app/audio/processor.pitch_contour). */
export interface Contour {
  step: number
  segments: ContourSegment[]
}

/** For the notes graph: the notes heard in the hum, the ones the song's tune plays with these settings, and the hum as sung. */
export interface SongNotes {
  sung: Note[]
  played: Note[]
  contour?: Contour
}

const TALK_TIMEOUT_MS = 30_000

/** Sends a spoken command with the current settings (commands are relative, like "a bit faster"); `character` is the gnome who answers. */
export async function sendTalk(recording: Blob, settings: SongSettings, previous: SongSettings | null, character: GnomeId): Promise<TalkTurn> {
  const form = new FormData()
  form.append('audio', recording, recordingName(recording.type))
  form.append('state', JSON.stringify({ settings, previous, character }))
  const response = await fetch(apiUrl('/api/talk/voice'), { method: 'POST', body: form, signal: AbortSignal.timeout(TALK_TIMEOUT_MS) })
  const reply = (await response.json().catch(() => null)) as (TalkTurn & { error?: string }) | null
  if (!response.ok || !reply) throw new Error(reply?.error ?? `The backend answered ${response.status}`)
  return reply
}

/** Where the spoken reply streams from; an audio element can play it as it arrives. */
export function speechUrl(speechId: string) {
  return apiUrl(`/api/talk/speech/${encodeURIComponent(speechId)}`)
}

/** The route that makes the song from the hum and the settings: the audio pipeline's orchestral
 *  arrangement (/pipeline/song), or talk mode's own engine (/talk/song). Both take the same body. */
export const PIPELINE_SONG_URL = '/api/pipeline/song'
export const TALK_SONG_URL = '/api/talk/song'
/** The notes graph for a song from the matching route. */
export const PIPELINE_NOTES_URL = '/api/pipeline/notes'
export const TALK_NOTES_URL = '/api/talk/notes'

/** The song made from the hum /upload saved (its `filename`). Throws UploadError, like uploadHum. */
export async function makeSong(hum: string, settings: SongSettings, signal?: AbortSignal, url = TALK_SONG_URL): Promise<Blob> {
  let response: Response
  let body: string
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    response = await fetch(apiUrl(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hum, settings }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (response.ok) return await response.blob()
    body = await response.text()
  } catch (error) {
    throw toNetworkFailure(error)
  }
  throw toHttpFailure(response.status, response.headers.get('content-type') ?? '', body)
}

export async function fetchNotes(hum: string, settings: SongSettings, url = TALK_NOTES_URL): Promise<SongNotes> {
  const response = await fetch(apiUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hum, settings }),
  })
  if (!response.ok) throw new Error(`The backend answered ${response.status}`)
  return (await response.json()) as SongNotes
}

/** Chrome records webm and Safari mp4; the backend's speech to text accepts both. */
function recordingName(type: string) {
  return type.includes('mp4') ? 'talk.mp4' : 'talk.webm'
}
