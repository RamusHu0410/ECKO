/*
 * Requests a generated accompaniment from the backend and returns audio the
 * browser can play.
 *
 * Contract (Flask, backend/src/app/routes/accompaniment.py):
 *   POST /accompaniment/generate  (JSON body)
 *   {
 *     melody: [{ hz, start, duration }, ...],  // hz = MIDI note number; time in beats
 *     key?, mode?, tempo?,
 *     style?: 'piano'|'pop'|'cinematic'|'classical'|'jazz'|'asian_folk',
 *     instrument?: 'piano'|'guitar'|'guitar_jazz'|'strings'|'sax'|...,
 *     modulate?: { key?, mode? },
 *     format: 'wav' | 'midi' | 'json',
 *   }
 * With format=wav the response is audio/wav bytes; with format=json it is metadata.
 *
 * The browser calls /api/accompaniment/generate; the Vite dev server forwards it to Flask
 * without the /api prefix (vite.config.ts), so requests stay same-origin and need no CORS.
 */

const GENERATE_URL = '/api/accompaniment/generate'
const TIMEOUT_MS = 90_000

export interface MelodyNote {
  /** MIDI note number (e.g. 60 = middle C). Named hz for backend compatibility. */
  hz: number
  /** Onset time in beats. */
  start: number
  /** Length in beats. */
  duration: number
}

export interface GenerateOptions {
  key?: string
  mode?: 'major' | 'minor'
  tempo?: number
  style?: 'piano' | 'pop' | 'cinematic' | 'classical' | 'jazz' | 'asian_folk'
  instrument?: string
  modulate?: { key?: string; mode?: 'major' | 'minor' }
}

/** A finished accompaniment ready to play. */
export interface Accompaniment {
  /** Object URL for the WAV — assign to an <audio> src or `new Audio(url)`. Revoke when done. */
  url: string
  /** The raw WAV blob, if you want to download or re-use it. */
  blob: Blob
}

export type GenerateFailureKind = 'unreachable' | 'timeout' | 'unavailable' | 'rejected' | 'server' | 'unexpected'

export class GenerateError extends Error {
  readonly kind: GenerateFailureKind
  constructor(kind: GenerateFailureKind, detail: string) {
    super(detail)
    this.name = 'GenerateError'
    this.kind = kind
  }
}

/**
 * Ask the backend to compose an accompaniment for `melody` and return a playable WAV.
 *
 * Play it with:
 *   const acc = await generateAccompaniment(melody, { style: 'jazz' })
 *   const audio = new Audio(acc.url)
 *   audio.play()
 *   // when finished: URL.revokeObjectURL(acc.url)
 *
 * Throws GenerateError on failure, or a DOMException "AbortError" if `signal` cancels it.
 */
export async function generateAccompaniment(
  melody: MelodyNote[],
  options: GenerateOptions = {},
  signal?: AbortSignal,
): Promise<Accompaniment> {
  const body = JSON.stringify({ melody, format: 'wav', ...options })

  const startedAt = performance.now()
  devLog(`→ POST ${GENERATE_URL} (${melody.length} notes, style=${options.style ?? 'classical'})`)

  let response: Response
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    response = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    throw logFailure(toNetworkFailure(error))
  }

  const contentType = response.headers.get('content-type') ?? ''
  const elapsed = Math.round(performance.now() - startedAt)
  devLog(`← ${response.status} ${contentType || 'no content type'}, ${elapsed} ms`)

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw logFailure(toHttpFailure(response.status, contentType, text))
  }

  if (!contentType.includes('audio')) {
    const text = await response.text().catch(() => '')
    throw logFailure(new GenerateError('unexpected', `Expected audio from the backend but got ${contentType || 'no content type'}: ${text.slice(0, 200)}`))
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  return { url, blob }
}

/** What the backend parsed from the input — the "audio to data" conversion. */
export interface DebugReport {
  ok: boolean
  /** Set when parsing failed. */
  error?: string
  note_count: number
  parsed_notes: MelodyNote[]
  pitch_range: { min: number; max: number } | null
  time_span_beats: number
  declared_key?: string | null
  declared_mode?: string | null
  declared_tempo?: number
  detected_key?: string | null
  detected_mode?: string | null
  num_bars?: number
  bars?: Array<{ bar: number; notes: MelodyNote[]; pitch_classes: number[] }>
  mode_note?: string
}

/**
 * Debug: ask the backend to show what it parsed from `melody` WITHOUT composing
 * or rendering anything. Use this to see where a problem is (bad input data vs.
 * bad composition) — e.g. wrong pitches, wrong timing, wrong detected key.
 *
 *   const report = await debugConvert(melody)
 *   console.table(report.parsed_notes)
 *   console.log('detected key:', report.detected_key, report.detected_mode)
 */
export async function debugConvert(
  melody: MelodyNote[],
  options: Pick<GenerateOptions, 'key' | 'mode' | 'tempo'> = {},
  signal?: AbortSignal,
): Promise<DebugReport> {
  const body = JSON.stringify({ melody, debug: true, ...options })
  devLog(`→ POST ${GENERATE_URL} (debug, ${melody.length} notes)`)

  let response: Response
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    response = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    throw logFailure(toNetworkFailure(error))
  }

  const text = await response.text()
  const report = parseJson(text) as DebugReport | null
  if (!report) {
    throw logFailure(new GenerateError('unexpected', `Debug reply wasn't JSON: ${text.slice(0, 200)}`))
  }
  return report
}

function toNetworkFailure(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'AbortError') return error
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new GenerateError('timeout', `No reply from the backend within ${TIMEOUT_MS / 1000} seconds.`)
  }
  return new GenerateError('unreachable', `The request never reached the backend: ${String(error)}`)
}

function toHttpFailure(status: number, contentType: string, body: string): GenerateError {
  const reply = contentType.includes('application/json') ? (parseJson(body) as { error?: string; details?: string } | null) : null
  const said = [reply?.error, reply?.details].filter(Boolean).join(': ') || body.slice(0, 200) || 'no details'
  if (status >= 502 && status <= 504) return new GenerateError('unreachable', `The backend isn't answering (${status}).`)
  // 503 = WAV rendering unavailable (FluidSynth/soundfont missing on the server).
  if (status === 503) return new GenerateError('unavailable', `Audio rendering is unavailable on the server: ${said}`)
  if (status >= 500) return new GenerateError('server', `${status}: ${said}`)
  return new GenerateError('rejected', `${status}: ${said}`)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function devLog(message: string) {
  if (import.meta.env.DEV) console.info(`[ECKO api] ${message}`)
}

function logFailure<E extends Error>(error: E): E {
  if (import.meta.env.DEV && error.name !== 'AbortError') console.warn(`[ECKO api] ✕ ${error.name}: ${error.message}`)
  return error
}
