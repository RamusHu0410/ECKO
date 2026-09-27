/*
 * Makes the song from a hum with one of the three engines the sound slider blends: "Classical piano",
 * "Synth" and "Creepy".
 *
 * Contract (Flask, backend/src/app/routes/main.py, accompaniment_generate):
 *   POST /accompaniment/generate  (JSON body)
 *   {
 *     melody: [{ hz, start, duration }, ...],  // hz = MIDI note number; time in beats (from /upload)
 *     tempo?, mode?: 'major'|'minor',
 *     style?: 'piano'|'pop'|'cinematic'|'classical'|'jazz'|'asian_folk',  // classical by default
 *     instrument?: a General MIDI number (0-127) or a name ('synth', 'piano', ...),  // synth by default
 *     format: 'wav',
 *     sound?: 'normal'|'creepy',  // creepy renders with FluidSynth's retro demo soundfont
 *   }
 * 200 → audio/wav bytes. 400 / 500 / 503 → JSON { error, details? }.
 *
 * The browser calls /api/accompaniment/generate; the Vite dev server forwards it to Flask
 * without the /api prefix (vite.config.ts), so requests stay same-origin and need no CORS.
 */
import { TIMEOUT_MS, toHttpFailure, toNetworkFailure, type HumUpload } from './uploadHum'
import type { SongSettings } from '../hooks/useSongSettings'

const GENERATE_URL = '/api/accompaniment/generate'

export interface MelodyNote {
  /** MIDI note number (e.g. 60 = middle C). Named hz for backend compatibility. */
  hz: number
  /** Onset time in beats. */
  start: number
  /** Length in beats. */
  duration: number
}

export type Engine = 'classical-piano' | 'synth' | 'creepy'

/**
 * What each engine asks the accompanist for: a style, and an instrument as its General MIDI number
 * (0 = grand piano, 89 = warm pad). `lead` is talk mode's name for the same instrument
 * (backend app/talk/song.py PROGRAMS), so its versions keep the engine's sound. Creepy is the
 * classical piano through the retro soundfont, which only this route can play.
 */
export const ENGINES: Record<Engine, { style: string; instrument: number; lead: string; sound: 'normal' | 'creepy' }> = {
  'classical-piano': { style: 'classical', instrument: 0, lead: 'piano', sound: 'normal' },
  synth: { style: 'cinematic', instrument: 89, lead: 'synth pad', sound: 'normal' },
  creepy: { style: 'classical', instrument: 0, lead: 'piano', sound: 'creepy' },
}

/** The engines from left to right on the sound slider. */
export const ENGINE_ORDER: Engine[] = ['classical-piano', 'synth', 'creepy']

/**
 * The song for a saved hum with `engine`, as WAV. The faders shape it the same way talk mode's
 * POST /talk/song does (backend app/talk/song.py, engine_request): speed changes the tempo, pitch
 * moves the tune up to an octave, emotion picks minor or major.
 * Throws UploadError for every failure, or a DOMException "AbortError" if `signal` cancels it.
 */
export async function generateSong(hum: HumUpload, engine: Engine, settings: SongSettings, signal?: AbortSignal): Promise<Blob> {
  const shift = Math.round((settings.pitch - 0.5) * 24)
  const tempo = hum.tempo ?? 100
  const { style, instrument, sound } = ENGINES[engine]
  const body = {
    style,
    instrument,
    sound,
    melody: (hum.melody ?? []).map((note) => ({ ...note, hz: Math.min(127, Math.max(0, note.hz + shift)) })),
    tempo: Math.round(tempo * (0.5 + settings.speed) * 10) / 10,
    mode: settings.emotion < 0.4 ? 'minor' : settings.emotion > 0.6 ? 'major' : undefined,
    format: 'wav',
  }
  devLog(`→ POST ${GENERATE_URL} (${engine}, ${body.melody.length} notes)`)

  let response: Response
  let text: string
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    response = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (response.ok) return await response.blob()
    text = await response.text()
  } catch (error) {
    throw toNetworkFailure(error)
  }
  devLog(`← ${response.status} ${text.slice(0, 200)}`)
  throw toHttpFailure(response.status, response.headers.get('content-type') ?? '', text)
}

/** The song settings that make talk mode's version (POST /talk/song) sound like `engine`: its style, and its instrument as the lead. */
export function engineSettings(settings: SongSettings, engine: Engine): Partial<SongSettings> {
  const { style, lead } = ENGINES[engine]
  return { style, instruments: settings.instruments.map((part) => (part.role === 'lead' ? { ...part, name: lead } : part)) }
}

function devLog(message: string) {
  if (import.meta.env.DEV) console.info(`[ECKO api] ${message}`)
}
