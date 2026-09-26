/*
 * The social feed: records other people have shared. Sample data for now, with the likes a person
 * gives kept in this browser so the page behaves like the real thing.
 *
 * TODO(backend): `feed()` becomes GET /api/posts (the discussion hub already has the routes), and
 * `setLiked()` becomes POST/DELETE /api/posts/<id>/like. The shapes below are what the page reads.
 */
import { SECONDS_PER_NOTE as SAMPLE_SECONDS_PER_NOTE, samplePreview } from './sampleAudio'


export interface FeedRecord {
  id: string
  title: string
  /** Who shared it; a real user once accounts exist. */
  by: string
  initials: string
  /** How long ago, already in words, because the sample data has no real clock. */
  when: string
  seconds: number
  likes: number
  /** Whether this person has liked it. */
  liked: boolean
  /** TODO(backend): the address the server serves the shared song from. Null means play the stand-in. */
  audioUrl: string | null
  /** How many notes the stand-in phrase has, which is also how long the row says it lasts. */
  notes: number
}

const LIKED_KEY = 'ecko:liked'

type SampleRow = Omit<FeedRecord, 'liked' | 'seconds'>

const SAMPLE: SampleRow[] = [
  { id: 'feed-1', title: 'Something for the walk home', by: 'Mira', initials: 'M', when: '2 hours ago', likes: 128, audioUrl: null, notes: 8 },
  { id: 'feed-2', title: 'Hummed it in the shower', by: 'Tomas', initials: 'T', when: '5 hours ago', likes: 94, audioUrl: null, notes: 5 },
  { id: 'feed-3', title: 'Four notes and a kettle', by: 'Ade', initials: 'A', when: 'Yesterday', likes: 240, audioUrl: null, notes: 12 },
  { id: 'feed-4', title: 'The one that got stuck', by: 'Lena', initials: 'L', when: 'Yesterday', likes: 51, audioUrl: null, notes: 6 },
  { id: 'feed-5', title: 'Birthday song, third try', by: 'Sam', initials: 'S', when: '3 days ago', likes: 77, audioUrl: null, notes: 9 },
]

/** The records to show, with this person's likes already applied. */
export async function feed(): Promise<FeedRecord[]> {
  // TODO(backend): GET /api/posts?page=1 and map each post onto this shape.
  const liked = likedIds()
  return SAMPLE.map((record) => ({
    ...record,
    seconds: record.notes * SAMPLE_SECONDS_PER_NOTE,
    liked: liked.has(record.id),
    likes: record.likes + (liked.has(record.id) ? 1 : 0),
  }))
}

/** Likes or unlikes one record, and returns the count to show. */
export async function setLiked(record: FeedRecord, liked: boolean): Promise<number> {
  // TODO(backend): POST /api/posts/<id>/like, or DELETE to take it back.
  const ids = likedIds()
  if (liked) ids.add(record.id)
  else ids.delete(record.id)
  save(ids)
  const base = SAMPLE.find((sample) => sample.id === record.id)?.likes ?? record.likes
  return base + (liked ? 1 : 0)
}

/**
 * Where to play a shared record from: the server's address once there is one, and until then a
 * stand-in phrase made in the browser, so the feed's play buttons are real.
 */
export function audioFor(record: FeedRecord): string {
  return record.audioUrl ?? samplePreview(record.id, record.notes)
}

/** Which records this browser has liked. Storage can be blocked, so a failure means "none". */
function likedIds(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(LIKED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function save(ids: Set<string>): void {
  try {
    window.localStorage.setItem(LIKED_KEY, JSON.stringify([...ids]))
  } catch {
    // a private window with storage blocked: the like just doesn't stick
  }
}
