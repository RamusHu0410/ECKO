import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import PostCard from '../components/Community/PostCard'
import ShareSheet from '../components/Community/ShareSheet'
import GlassButton from '../components/GlassButton/GlassButton'
import { useRecordPlayer } from '../hooks/useRecordPlayer'
import { FLAIRS, SORTS, audioFor, deletePost, listPosts, onCommunityChange, votePost, type Flair, type Post, type Sort, type Vote } from '../data/community'
import { appear } from '../design/motion'

const SORT_NAMES: Record<Sort, string> = { hot: 'Hot', new: 'New', top: 'Top' }

/**
 * The community board: songs people have shared, sorted hot, new or top, each with votes, a
 * comment thread and a share link. Sample posts for now (data/community.ts); a song shared from
 * this browser lands at the top of the feed straight away, whichever tab shared it.
 *
 * A link to /community#<post id> opens that post's thread.
 */
export default function CommunityPage() {
  const [sort, setSort] = useState<Sort>('hot')
  const [flair, setFlair] = useState<Flair | null>(null)
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(() => window.location.hash.slice(1) || null)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const player = useRecordPlayer()

  const load = useCallback(() => {
    listPosts(sort).then(setPosts, () => setPosts([]))
  }, [sort])
  useEffect(load, [load])
  useEffect(() => onCommunityChange(load), [load])

  // a shared link: bring its post into view once the feed is there
  const arrived = useRef(false)
  useEffect(() => {
    if (!posts || arrived.current) return
    arrived.current = true // only on arrival, not every time a thread is opened
    if (openId) document.getElementById(openId)?.scrollIntoView({ block: 'start' })
  }, [posts, openId])

  // a link to another post followed while already here only changes the hash
  useEffect(() => {
    const follow = () => {
      const id = window.location.hash.slice(1)
      if (!id) return
      setOpenId(id)
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])

  useEffect(() => {
    if (!freshId) return
    const timer = window.setTimeout(() => setFreshId(null), 2400)
    return () => window.clearTimeout(timer)
  }, [freshId])

  const vote = (post: Post, next: Vote) => {
    setPosts((current) => current?.map((row) => (row.id === post.id ? { ...row, vote: next, score: row.score - row.vote + next } : row)) ?? null)
    void votePost(post.id, next)
  }

  const remove = async (post: Post) => {
    if (player.playingId === post.id) player.stop()
    await deletePost(post.id) // the change listener reloads the feed
  }

  const shared = (post: Post) => {
    // show it where it lands: new posts are first under "New"
    setSort('new')
    setFlair(null)
    setFreshId(post.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const shown = posts?.filter((post) => !flair || post.flair === flair)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 pt-28 pb-16 sm:px-5 lg:px-12">
      <motion.header className="flex flex-wrap items-end justify-between gap-4" {...appear}>
        <div>
          <h1 className="font-display text-4xl text-ink">Community</h1>
          <p className="mt-1 text-sm text-ink-muted">Hums, remixes and half-finished tunes, shared by everyone.</p>
        </div>
        <GlassButton onClick={() => setSharing(true)}>Share a record</GlassButton>
      </motion.header>

      <div className="flex flex-col gap-3">
        <div className="glass-surface glass-control flex w-fit gap-1 p-1" role="tablist" aria-label="Sort posts">
          {SORTS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={sort === option}
              onClick={() => setSort(option)}
              className={`glass-content cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium ${sort === option ? 'bg-ink text-page' : 'text-ink-muted hover:text-ink'}`}
            >
              {SORT_NAMES[option]}
            </button>
          ))}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Filter by flair">
          <FlairChip label="Everything" pressed={flair === null} onClick={() => setFlair(null)} />
          {FLAIRS.map((option) => (
            <FlairChip key={option} label={option} pressed={flair === option} onClick={() => setFlair(flair === option ? null : option)} />
          ))}
        </div>
      </div>

      {posts === null && <p className="text-sm text-ink-muted">Loading the board…</p>}

      <div className="flex flex-col gap-4">
        {shown?.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            fresh={post.id === freshId}
            playing={player.playingId === post.id}
            onPlay={() => player.toggle(post.id, () => audioFor(post))}
            onVote={(next) => vote(post, next)}
            onDelete={() => void remove(post)}
            open={openId === post.id}
            onToggleComments={() => setOpenId(openId === post.id ? null : post.id)}
          />
        ))}
      </div>

      {shown?.length === 0 && <p className="text-sm text-ink-muted">{flair ? `Nothing tagged “${flair}” yet.` : 'Nothing shared yet.'}</p>}

      <ShareSheet open={sharing} onClose={() => setSharing(false)} onShared={shared} />
    </main>
  )
}

function FlairChip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap ${pressed ? 'border-ink bg-ink text-page' : 'border-hairline bg-white/40 text-ink hover:bg-white/70'}`}
    >
      {label}
    </button>
  )
}
