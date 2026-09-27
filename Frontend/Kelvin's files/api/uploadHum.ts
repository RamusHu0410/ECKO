/*
 * Sends a hum to the backend (talk mode's calls, and making the song, are in talk.ts).
 *
 * Contract (Flask, backend/src/app/routes/main.py): POST /upload, multipart form data with the
 * recording in a field named "file" whose filename ends in .wav, at most 50 MB.
 * 201 → JSON describing the saved file, plus either `audio_analysis` or `processing_error`.
 * 400 → JSON { error } (plus code "no_tune" when no tune was heard), 500 → JSON { error, details },
 * 413 → too large (HTML).
 * The browser calls /api/upload; the Vite dev server forwards it to Flask without the /api
 * prefix (vite.config.ts), so requests stay same-origin and need no CORS.
 */
import { encodeWav } from '../audio/encodeWav'
import type { MelodyNote } from './generateAccompaniment'
import { apiUrl } from './base'

const UPLOAD_URL = apiUrl('/api/upload')
/** Backend work can be slow; give up after this long. */
export const TIMEOUT_MS = 90_000

/** What POST /upload returns on success. */
export interface HumUpload {
  status: 'success'
  message: string
  filename: string
  size_bytes: number
  size_mb: number
  saved_path: string
  /** Present when the backend analysed the hum. */
  audio_analysis?: HumAnalysis
  /** Present when the backend analysed the hum: notes ready for POST /accompaniment/generate. */
  melody?: MelodyNote[]
  /** The tempo `melody`'s beats are counted in. */
  tempo?: number
  /** Present when the file was saved but the backend couldn't analyse it. */
  processing_error?: string
  processing_time_seconds: number
  total_request_time_seconds: number
}

/** The headline parts of the backend's analysis (it sends more detail than this). */
export interface HumAnalysis {
  duration: number
  sample_rate: number
  is_silent: boolean
  num_segments?: number
  pitch?: { mean_hz: number; median_hz: number; min_hz: number; max_hz: number; voiced_frames: number }
}

export type UploadFailureKind = 'conversion' | 'unreachable' | 'timeout' | 'too-large' | 'rejected' | 'server' | 'unexpected'

/**
 * A failed upload: a kind the UI can explain, the technical detail, and, when the backend refused
 * the recording and said why in words for the user (e.g. "No tune was found…"), that reason.
 */
export class UploadError extends Error {
  readonly kind: UploadFailureKind
  readonly reason: string | null

  constructor(kind: UploadFailureKind, detail: string, reason: string | null = null) {
    super(detail)
    this.name = 'UploadError'
    this.kind = kind
    this.reason = reason
  }
}

/**
 * Sends a recorded hum to the backend and returns its reply. Browsers record webm (Chrome) or
 * mp4 (Safari) and the backend only accepts WAV, so other formats are converted to WAV first.
 * Throws UploadError for every failure, or a DOMException "AbortError" if `signal` cancels it.
 */
export async function uploadHum(recording: Blob, signal?: AbortSignal): Promise<HumUpload> {
  const wav = await toWav(recording)
  const form = new FormData()
  form.append('file', wav, 'recording.wav')

  const startedAt = performance.now()
  devLog(`→ POST ${UPLOAD_URL} (${wav.size} bytes of WAV)`)

  let response: Response
  let body: string
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    response = await fetch(UPLOAD_URL, {
      method: 'POST',
      body: form,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    body = await response.text()
  } catch (error) {
    throw logFailure(toNetworkFailure(error))
  }

  const contentType = response.headers.get('content-type') ?? ''
  const elapsed = Math.round(performance.now() - startedAt)
  devLog(`← ${response.status} ${contentType || 'no content type'}, ${body.length} bytes, ${elapsed} ms`)

  if (!response.ok) throw logFailure(toHttpFailure(response.status, contentType, body))
  if (!contentType.includes('application/json')) {
    throw logFailure(new UploadError('unexpected', `Expected JSON from the backend but got ${contentType || 'no content type'}.`))
  }

  const reply = parseJson(body) as HumUpload | null
  if (reply?.status !== 'success') {
    throw logFailure(new UploadError('unexpected', `The backend replied without "status": "success": ${body.slice(0, 200)}`))
  }
  if (reply.processing_error) devLog(`the backend saved the hum but couldn't analyse it: ${reply.processing_error}`)
  return reply
}

async function toWav(recording: Blob): Promise<Blob> {
  if (recording.type === 'audio/wav' || recording.type === 'audio/wave') return recording
  try {
    return await encodeWav(recording)
  } catch (error) {
    throw logFailure(new UploadError('conversion', `Couldn't convert the ${recording.type || 'unknown'} recording to WAV: ${String(error)}`))
  }
}

export function toNetworkFailure(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'AbortError') return error // cancelled on purpose
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new UploadError('timeout', `No reply from the backend within ${TIMEOUT_MS / 1000} seconds.`)
  }
  return new UploadError('unreachable', `The request never reached the backend: ${String(error)}`)
}

export function toHttpFailure(status: number, contentType: string, body: string): UploadError {
  const reply = contentType.includes('application/json') ? (parseJson(body) as { error?: string; details?: string } | null) : null
  const said = [reply?.error, reply?.details].filter(Boolean).join(': ') || body.slice(0, 200) || 'no details'
  if (status === 413) return new UploadError('too-large', `The backend refused the file as too large (413).`)
  // the Vite proxy answers 502–504 itself when nothing is listening on the backend's port
  if (status >= 502 && status <= 504) return new UploadError('unreachable', `The backend isn't answering (${status}).`)
  if (status >= 500) return new UploadError('server', `${status}: ${said}`)
  return new UploadError('rejected', `${status}: ${said}`, reply?.error ?? null)
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
