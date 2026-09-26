/*
 * The records a person has made: saved in this browser, listed on the profile page, played from
 * either page. The one place the rest of the app asks about records.
 *
 * TODO(backend): every function here is a seam. With accounts they become calls to the API
 * (POST /api/recordings, GET /api/recordings) with the browser store kept as the offline copy;
 * the pages and hooks that use them don't change. `ownerId` is already carried on each record so
 * a real user id can replace the placeholder without a migration.
 */
import type { SongSettings } from '../hooks/useSongSettings'
import { RECORDS, getAll, put, remove } from './browserStore'
import { me } from './profile'

/** One finished song, with the audio that plays it. */
export interface SavedRecord {
  id: string
  /** What it's called on the profile page; named after when it was made until someone renames it. */
  title: string
  /** Epoch milliseconds. */
  madeAt: number
  /** Seconds, from the audio itself; 0 when it couldn't be measured. */
  seconds: number
  /** TODO(backend): a real user id once accounts exist. */
  ownerId: string
  /** The faders and instruments the song was made with, so it could be remade later. */
  settings: SongSettings
  /** The song itself. Blobs survive IndexedDB; they would be a file upload against a real backend. */
  audio: Blob
}

/** Everything this person has made, newest first. */
export async function listRecords(): Promise<SavedRecord[]> {
  // TODO(backend): GET /api/recordings for the signed-in user, falling back to this on no network.
  const saved = await getAll<SavedRecord>(RECORDS)
  return saved.filter((record) => record.ownerId === me().id).sort((a, b) => b.madeAt - a.madeAt)
}

/** Keeps a finished song and returns it as it was saved. */
export async function saveRecord(audio: Blob, settings: SongSettings): Promise<SavedRecord> {
  const madeAt = Date.now()
  const record: SavedRecord = {
    id: newId(),
    title: titleFor(madeAt),
    madeAt,
    seconds: await durationOf(audio),
    ownerId: me().id,
    settings,
    audio,
  }
  // TODO(backend): POST /api/recordings (multipart: the audio plus the settings as JSON).
  await put(RECORDS, record)
  return record
}

/**
 * Swaps in a newer version of a record already saved: the same hum after a fader moved or a
 * spoken edit, so the profile holds the song as it was last left rather than the first try.
 */
export async function updateRecord(id: string, audio: Blob, settings: SongSettings): Promise<void> {
  const existing = (await getAll<SavedRecord>(RECORDS)).find((record) => record.id === id)
  if (!existing) return
  // TODO(backend): PUT /api/recordings/<id> with the new audio and settings.
  await put(RECORDS, { ...existing, audio, settings, seconds: await durationOf(audio) })
}

export async function deleteRecord(id: string): Promise<void> {
  // TODO(backend): DELETE /api/recordings/<id>.
  await remove(RECORDS, id)
}

/** A record's audio as an address an <audio> element can play. Revoke it when done. */
export function audioUrl(record: SavedRecord): string {
  return URL.createObjectURL(record.audio)
}

/**
 * A short line about how a record sounds, for underneath its title: what plays the tune, and the
 * faders only where they were actually moved. Deliberately in plain words, like the faders' own
 * labels, so the profile reads the same way the studio does.
 */
export function describeRecord({ settings }: SavedRecord): string {
  const lead = settings.instruments.find((instrument) => instrument.role === 'lead')?.name
  const words = [settings.style ?? lead ?? 'synth']
  if (settings.emotion <= 0.35) words.push('moody')
  else if (settings.emotion >= 0.65) words.push('bright')
  if (settings.speed <= 0.35) words.push('slower')
  else if (settings.speed >= 0.65) words.push('faster')
  if (settings.pitch <= 0.35) words.push('lower')
  else if (settings.pitch >= 0.65) words.push('higher')
  return words.join(' · ')
}

/** "Record, 14 March, 16:20" — a name until someone types a better one. */
function titleFor(madeAt: number): string {
  const when = new Date(madeAt)
  return `Record · ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}, ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function newId(): string {
  return crypto.randomUUID?.() ?? `record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** How long a song lasts, read from the audio itself. 0 when the browser can't say. */
function durationOf(audio: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(audio)
    const element = new Audio()
    const done = (seconds: number) => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0)
    }
    element.onloadedmetadata = () => done(element.duration)
    element.onerror = () => done(0)
    element.src = url
  })
}
