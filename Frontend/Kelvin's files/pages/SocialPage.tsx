import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import RecordRow from '../components/RecordRow/RecordRow'
import { useRecordPlayer } from '../hooks/useRecordPlayer'
import { audioFor, feed, setLiked, type FeedRecord } from '../data/social'
import { appear } from '../design/motion'

/**
 * Records other people have shared. Sample rows for now (data/social.ts), with working like
 * buttons so the page behaves the way it will once there is a backend behind it.
 */
export default function SocialPage() {
  const [records, setRecords] = useState<FeedRecord[] | null>(null)
  const player = useRecordPlayer()

  useEffect(() => {
    feed().then(setRecords, () => setRecords([]))
  }, [])

  const like = async (record: FeedRecord) => {
    const liked = !record.liked
    const likes = await setLiked(record, liked)
    setRecords((current) => current?.map((row) => (row.id === record.id ? { ...row, liked, likes } : row)) ?? null)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-5 pt-28 pb-16 lg:px-12">
      <motion.header {...appear}>
        <h1 className="font-display text-4xl text-ink">Social</h1>
        <p className="mt-1 text-sm text-ink-muted">What other people have been humming.</p>
      </motion.header>

      {records === null && <p className="text-sm text-ink-muted">Loading the feed…</p>}

      <ul className="flex flex-col gap-3">
        {records?.map((record) => (
          <RecordRow
            key={record.id}
            title={record.title}
            detail={`${record.by} · ${record.when}`}
            seconds={record.seconds}
            playing={player.playingId === record.id}
            onPlay={() => player.toggle(record.id, () => audioFor(record))}
          >
            <LikeButton record={record} onToggle={() => void like(record)} />
          </RecordRow>
        ))}
      </ul>

      {records?.length === 0 && <p className="text-sm text-ink-muted">Nothing shared yet.</p>}
    </main>
  )
}

function LikeButton({ record, onToggle }: { record: FeedRecord; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs tabular-nums ${record.liked ? 'text-amber' : 'text-ink-muted hover:text-ink'}`}
      aria-pressed={record.liked}
      aria-label={`${record.liked ? 'Unlike' : 'Like'} ${record.title}, ${record.likes} likes`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill={record.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path d="M12 20.3 4.6 12.9a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5z" strokeLinejoin="round" />
      </svg>
      {record.likes}
    </button>
  )
}
