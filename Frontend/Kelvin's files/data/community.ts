/*
 * The community board: songs people have shared, each with a score, a thread of comments and a
 * link to pass around, Reddit-style. Sample posts are hard-coded; a song this person shares is kept
 * in the browser (IndexedDB, alongside their records) and joins the same feed as a new post.
 *
 * TODO(backend): every exported function is a seam for the API.
 *   listPosts()     GET    /api/community/posts?sort=hot|new|top
 *   sharePost()     POST   /api/community/posts            (multipart: audio + title/body/flair)
 *   deletePost()    DELETE /api/community/posts/<id>
 *   votePost()      PUT    /api/community/posts/<id>/vote  { vote: -1 | 0 | 1 }
 *   listComments()  GET    /api/community/posts/<id>/comments
 *   addComment()    POST   /api/community/posts/<id>/comments { body, parentId }
 *   voteComment()   PUT    /api/community/comments/<id>/vote
 * The shapes below are what the page reads, so only this file changes.
 */
import { POSTS, getAll, put, remove } from './browserStore'
import { SECONDS_PER_NOTE, samplePreview } from './sampleAudio'
import { me, type Person } from './profile'

export type Vote = -1 | 0 | 1

export const FLAIRS = ['Fresh hum', 'Remix', 'Work in progress', 'Feedback wanted', 'Collab'] as const
export type Flair = (typeof FLAIRS)[number]

export const SORTS = ['hot', 'new', 'top'] as const
export type Sort = (typeof SORTS)[number]

/** Who wrote a post or comment: just enough of a person to show beside it. */
export type Author = Pick<Person, 'id' | 'name' | 'handle' | 'initials'>

export interface Post {
  id: string
  title: string
  /** A few words about the song; may be empty. */
  body: string
  flair: Flair
  author: Author
  /** Epoch milliseconds. */
  createdAt: number
  seconds: number
  /** Loudness bars for the waveform, 0–1. */
  peaks: number[]
  /** Everyone's votes, this person's included. */
  score: number
  /** How this person voted. */
  vote: Vote
  commentCount: number
  /** Shared by this person, so they may take it down. */
  mine: boolean
  /** The song, when it was shared from this browser. */
  audio: Blob | null
  /** TODO(backend): the address the server serves the song from. */
  audioUrl: string | null
  /** For sample posts with no audio: how many notes the stand-in phrase has. */
  notes: number
}

export interface Comment {
  id: string
  postId: string
  /** The comment this answers, or null for a reply to the post itself. */
  parentId: string | null
  author: Author
  body: string
  createdAt: number
  score: number
  vote: Vote
}

/** What sharing needs: the song and a few words about it. */
export interface ShareDraft {
  audio: Blob
  title: string
  body: string
  flair: Flair
  /** The profile record it came from, when there is one. */
  recordId?: string
}

/** A shared post as it is kept in IndexedDB. Scores and comments live elsewhere. */
interface StoredPost {
  id: string
  title: string
  body: string
  flair: Flair
  author: Author
  createdAt: number
  seconds: number
  peaks: number[]
  audio: Blob
  recordId?: string
}

const PEAK_BARS = 56
const VOTES_KEY = 'ecko:community:votes'
const COMMENTS_KEY = 'ecko:community:comments'

// ---------------------------------------------------------------------------------------------
// Sample data. TODO(backend): delete once the feed comes from the server.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** The samples are dated relative to page load, so "2h ago" stays true. */
const LOADED = Date.now()

const PEOPLE: Record<string, Author> = {
  mira: { id: 'mira', name: 'Mira', handle: '@mirahums', initials: 'M' },
  tomas: { id: 'tomas', name: 'Tomas', handle: '@tomas.k', initials: 'T' },
  ade: { id: 'ade', name: 'Ade', handle: '@kettlebeats', initials: 'A' },
  lena: { id: 'lena', name: 'Lena', handle: '@lena_l', initials: 'L' },
  sam: { id: 'sam', name: 'Sam', handle: '@samsings', initials: 'S' },
  juno: { id: 'juno', name: 'Juno', handle: '@juno', initials: 'J' },
}

type SamplePost = Omit<Post, 'vote' | 'commentCount' | 'mine' | 'audio' | 'audioUrl' | 'seconds' | 'peaks'>
type SampleComment = Omit<Comment, 'vote'>

const SAMPLE_POSTS: SamplePost[] = [
  {
    id: 'c-walk-home',
    title: 'Something for the walk home',
    body: 'Hummed this under my breath the whole way back from the station. ECKO turned it into a little lo-fi thing and now I cannot stop playing it.',
    flair: 'Fresh hum',
    author: PEOPLE.mira,
    createdAt: LOADED - 2 * HOUR,
    score: 128,
    notes: 8,
  },
  {
    id: 'c-kettle',
    title: 'Four notes and a kettle',
    body: 'The kettle whistled a note and I just carried on from it. Pushed the emotion fader all the way up.',
    flair: 'Remix',
    author: PEOPLE.ade,
    createdAt: LOADED - 9 * HOUR,
    score: 240,
    notes: 12,
  },
  {
    id: 'c-shower',
    title: 'Hummed it in the shower, need a second half',
    body: 'I have the first bit but it just stops. Anyone want to hum the rest? Open to anything.',
    flair: 'Collab',
    author: PEOPLE.tomas,
    createdAt: LOADED - 5 * HOUR,
    score: 94,
    notes: 5,
  },
  {
    id: 'c-stuck',
    title: 'The one that got stuck in my head for three days',
    body: '',
    flair: 'Work in progress',
    author: PEOPLE.lena,
    createdAt: LOADED - 1 * DAY - 3 * HOUR,
    score: 51,
    notes: 6,
  },
  {
    id: 'c-birthday',
    title: 'Birthday song for my sister, third try. Too slow?',
    body: 'Slowed the speed fader down because it felt rushed, but now I think it drags. Honest opinions please.',
    flair: 'Feedback wanted',
    author: PEOPLE.sam,
    createdAt: LOADED - 3 * DAY,
    score: 77,
    notes: 9,
  },
  {
    id: 'c-rain',
    title: 'Rainy window, low pitch',
    body: 'Everything turned down low. Sounds like a cello if you squint.',
    flair: 'Fresh hum',
    author: PEOPLE.juno,
    createdAt: LOADED - 40 * MINUTE,
    score: 12,
    notes: 7,
  },
]

const SAMPLE_COMMENTS: SampleComment[] = [
  { id: 'cm-1', postId: 'c-walk-home', parentId: null, author: PEOPLE.tomas, body: 'The bit around 0:02 where it lifts is lovely.', createdAt: LOADED - 90 * MINUTE, score: 14 },
  { id: 'cm-2', postId: 'c-walk-home', parentId: 'cm-1', author: PEOPLE.mira, body: 'That was me nearly missing the crossing, honestly.', createdAt: LOADED - 80 * MINUTE, score: 9 },
  { id: 'cm-3', postId: 'c-walk-home', parentId: null, author: PEOPLE.lena, body: 'Saving this for my own walk home tonight.', createdAt: LOADED - 30 * MINUTE, score: 4 },
  { id: 'cm-4', postId: 'c-kettle', parentId: null, author: PEOPLE.sam, body: 'Kettle-core is a genre now. I am calling it.', createdAt: LOADED - 7 * HOUR, score: 31 },
  { id: 'cm-5', postId: 'c-kettle', parentId: 'cm-4', author: PEOPLE.ade, body: 'Next up: microwave beep symphony.', createdAt: LOADED - 6 * HOUR, score: 22 },
  { id: 'cm-6', postId: 'c-kettle', parentId: 'cm-5', author: PEOPLE.juno, body: 'Please do not threaten me with a good time.', createdAt: LOADED - 5 * HOUR, score: 17 },
  { id: 'cm-7', postId: 'c-shower', parentId: null, author: PEOPLE.juno, body: 'I tried a second half going down instead of up. Will share it tonight.', createdAt: LOADED - 3 * HOUR, score: 6 },
  { id: 'cm-8', postId: 'c-birthday', parentId: null, author: PEOPLE.mira, body: 'Not too slow! Maybe one notch faster on the speed fader and it is perfect.', createdAt: LOADED - 2 * DAY, score: 11 },
  { id: 'cm-9', postId: 'c-birthday', parentId: null, author: PEOPLE.tomas, body: 'She is going to love it either way.', createdAt: LOADED - 2 * DAY + 2 * HOUR, score: 8 },
]

// ---------------------------------------------------------------------------------------------
// Posts

/** Every post, sample and shared, sorted, with this person's votes applied. */
export async function listPosts(sort: Sort = 'hot'): Promise<Post[]> {
  const votes = readVotes()
  const comments = allComments()
  const countFor = (id: string) => comments.filter((comment) => comment.postId === id).length

  const samples: Post[] = SAMPLE_POSTS.map((sample) => ({
    ...sample,
    seconds: sample.notes * SECONDS_PER_NOTE,
    peaks: peaksFor(sample.id),
    vote: votes[sample.id] ?? 0,
    score: sample.score + (votes[sample.id] ?? 0),
    commentCount: countFor(sample.id),
    mine: false,
    audio: null,
    audioUrl: null,
  }))

  // storage can be blocked (a private window); the samples still show
  const stored = await getAll<StoredPost>(POSTS).catch(() => [] as StoredPost[])
  const shared: Post[] = stored.map((post) => fromStored(post, votes, countFor(post.id)))

  return sortPosts([...shared, ...samples], sort)
}

/** Shares a song to the board and returns the new post, which the feed will show at once. */
export async function sharePost(draft: ShareDraft): Promise<Post> {
  const id = newId('post')
  const { seconds, peaks } = await measure(draft.audio, id)
  const stored: StoredPost = {
    id,
    title: draft.title.trim() || 'Untitled hum',
    body: draft.body.trim(),
    flair: draft.flair,
    author: authorOf(me()),
    createdAt: Date.now(),
    seconds,
    peaks,
    audio: draft.audio,
    recordId: draft.recordId,
  }
  // TODO(backend): POST /api/community/posts with the audio as a file.
  await put(POSTS, stored)
  // a new post starts upvoted by the person who shared it, as on Reddit
  writeVote(id, 1)
  changed()
  return fromStored(stored, readVotes(), 0)
}

export async function deletePost(id: string): Promise<void> {
  // TODO(backend): DELETE /api/community/posts/<id>.
  await remove(POSTS, id)
  changed()
}

/** Records this person's vote on a post (0 takes it back). */
export async function votePost(id: string, vote: Vote): Promise<void> {
  // TODO(backend): PUT /api/community/posts/<id>/vote.
  writeVote(id, vote)
}

/** Where to play a post from: its own audio, the server's copy, or a stand-in phrase. Revoke after. */
export function audioFor(post: Post): string {
  if (post.audio) return URL.createObjectURL(post.audio)
  return post.audioUrl ?? samplePreview(post.id, post.notes)
}

/** The address that opens this post's thread, for the share button. */
export function linkTo(post: Post): string {
  return `${window.location.origin}/community#${post.id}`
}

// ---------------------------------------------------------------------------------------------
// Comments

/** A post's comments, oldest first; the page nests them by `parentId`. */
export async function listComments(postId: string): Promise<Comment[]> {
  // TODO(backend): GET /api/community/posts/<id>/comments.
  const votes = readVotes()
  return allComments()
    .filter((comment) => comment.postId === postId)
    .map((comment) => ({ ...comment, vote: votes[comment.id] ?? 0, score: comment.score + (votes[comment.id] ?? 0) }))
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function addComment(postId: string, body: string, parentId: string | null = null): Promise<Comment> {
  const comment: SampleComment = { id: newId('comment'), postId, parentId, author: authorOf(me()), body: body.trim(), createdAt: Date.now(), score: 0 }
  // TODO(backend): POST /api/community/posts/<id>/comments.
  writeLocal(COMMENTS_KEY, [...readLocal<SampleComment[]>(COMMENTS_KEY, []), comment])
  writeVote(comment.id, 1)
  changed()
  return { ...comment, score: 1, vote: 1 }
}

export async function voteComment(id: string, vote: Vote): Promise<void> {
  // TODO(backend): PUT /api/community/comments/<id>/vote.
  writeVote(id, vote)
}

// ---------------------------------------------------------------------------------------------
// Keeping open pages current

const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ecko:community')
channel?.addEventListener('message', () => listeners.forEach((listener) => listener()))

/**
 * Calls `listener` whenever a post or comment is added or removed, in this tab or another, so a
 * feed that is already open picks up a song shared from the studio. Returns the unsubscribe.
 */
export function onCommunityChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function changed(): void {
  listeners.forEach((listener) => listener())
  channel?.postMessage('changed')
}

// ---------------------------------------------------------------------------------------------
// Helpers

/** "just now", "12m", "5h", "3d", then a date. */
export function ago(at: number, now = Date.now()): string {
  const gone = Math.max(0, now - at)
  if (gone < MINUTE) return 'just now'
  if (gone < HOUR) return `${Math.floor(gone / MINUTE)}m ago`
  if (gone < DAY) return `${Math.floor(gone / HOUR)}h ago`
  if (gone < 7 * DAY) return `${Math.floor(gone / DAY)}d ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** 1.2k for anything past a thousand, as feeds do. */
export function compact(count: number): string {
  return Math.abs(count) >= 1000 ? `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(count)
}

function sortPosts(posts: Post[], sort: Sort): Post[] {
  const now = Date.now()
  // Reddit's idea of "hot": score, cooled by age
  const heat = (post: Post) => post.score / ((now - post.createdAt) / HOUR + 2) ** 1.5
  const by: Record<Sort, (a: Post, b: Post) => number> = {
    hot: (a, b) => heat(b) - heat(a),
    new: (a, b) => b.createdAt - a.createdAt,
    top: (a, b) => b.score - a.score,
  }
  return [...posts].sort(by[sort])
}

function fromStored(post: StoredPost, votes: Record<string, Vote>, commentCount: number): Post {
  const vote = votes[post.id] ?? 0
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    flair: post.flair,
    author: post.author,
    createdAt: post.createdAt,
    seconds: post.seconds,
    peaks: post.peaks,
    score: vote, // TODO(backend): the server's tally; locally, only this person has voted
    vote,
    commentCount,
    mine: post.author.id === me().id,
    audio: post.audio,
    audioUrl: null,
    notes: 0,
  }
}

function authorOf({ id, name, handle, initials }: Person): Author {
  return { id, name, handle, initials }
}

function allComments(): SampleComment[] {
  return [...SAMPLE_COMMENTS, ...readLocal<SampleComment[]>(COMMENTS_KEY, [])]
}

/**
 * How long a song lasts and the shape of its loudness, read from the audio itself. Falls back to
 * a made-up shape when the browser can't decode it, so the post still has a waveform.
 */
async function measure(audio: Blob, id: string): Promise<{ seconds: number; peaks: number[] }> {
  try {
    const context = new OfflineAudioContext(1, 1, 44_100)
    const buffer = await context.decodeAudioData(await audio.arrayBuffer())
    const samples = buffer.getChannelData(0)
    const size = Math.max(1, Math.floor(samples.length / PEAK_BARS))
    const raw = Array.from({ length: PEAK_BARS }, (_, bar) => {
      let loudest = 0
      for (let i = bar * size; i < Math.min(samples.length, (bar + 1) * size); i++) loudest = Math.max(loudest, Math.abs(samples[i]))
      return loudest
    })
    const top = Math.max(...raw) || 1
    return { seconds: buffer.duration, peaks: raw.map((peak) => Math.max(0.08, peak / top)) }
  } catch {
    return { seconds: 0, peaks: peaksFor(id) }
  }
}

/** A believable waveform from an id: the same id always gives the same shape. */
function peaksFor(id: string): number[] {
  let seed = [...id].reduce((total, letter) => (total * 31 + letter.charCodeAt(0)) >>> 0, 11)
  let level = 0.5
  return Array.from({ length: PEAK_BARS }, (_, bar) => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
    level = Math.min(1, Math.max(0.15, level + ((seed % 1000) / 1000 - 0.5) * 0.45))
    const edges = Math.min(1, Math.min(bar, PEAK_BARS - 1 - bar) / 5 + 0.25) // quieter at the ends
    return level * edges
  })
}

function readVotes(): Record<string, Vote> {
  return readLocal<Record<string, Vote>>(VOTES_KEY, {})
}

function writeVote(id: string, vote: Vote): void {
  const votes = readVotes()
  if (vote === 0) delete votes[id]
  else votes[id] = vote
  writeLocal(VOTES_KEY, votes)
}

/** localStorage can be blocked or hold junk, so a failure means "nothing saved". */
function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked: the vote or comment just doesn't stick
  }
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`
}
