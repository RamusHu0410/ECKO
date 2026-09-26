import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ago, compact, linkTo, type Post, type Vote } from '../../data/community'
import { asLength } from '../RecordRow/RecordRow'
import { readPressMotion } from '../../design/readToken'
import VoteButtons from './VoteButtons'
import Waveform from './Waveform'
import CommentThread from './CommentThread'
import Avatar from './Avatar'

interface PostCardProps {
  post: Post
  playing: boolean
  onPlay: () => void
  onVote: (vote: Vote) => void
  onDelete: () => void
  /** Whether the comment thread is open. */
  open: boolean
  onToggleComments: () => void
  /** Just shared by this person: marked with an amber ring for a moment. */
  fresh?: boolean
}

/**
 * One post on the board: votes down the left; who shared it, when and the flair; the title and a
 * few words; the song as a play button and waveform; then comments and share, with the thread
 * opening underneath.
 */
export default function PostCard({ post, playing, onPlay, onVote, onDelete, open, onToggleComments, fresh }: PostCardProps) {
  const reducedMotion = useReducedMotion()
  const press = useMemo(readPressMotion, [])
  const [commentCount, setCommentCount] = useState(post.commentCount)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | undefined>(undefined)

  useEffect(() => setCommentCount(post.commentCount), [post.commentCount])
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const share = useCallback(async () => {
    const url = linkTo(post)
    // the phone's own share sheet where there is one, otherwise the link goes on the clipboard
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: post.title, text: `${post.title} — on ECKO`, url }).catch(() => undefined)
      return
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copy this link', url) // clipboard blocked (an insecure origin)
      return
    }
    setCopied(true)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }, [post])

  return (
    <motion.article
      id={post.id}
      layout={reducedMotion ? false : 'position'}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-surface glass-panel scroll-mt-28 px-3 py-4 sm:px-4 ${fresh ? 'outline-2 outline-offset-4 outline-amber' : ''}`}
      aria-labelledby={`${post.id}-title`}
    >
      <div className="glass-content flex gap-2 sm:gap-3">
        <VoteButtons score={post.score} vote={post.vote} label={post.title} onVote={onVote} />

        <div className="flex min-w-0 flex-1 flex-col gap-3 pr-1">
          <header className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <Avatar author={post.author} size="sm" />
            <span className="font-medium text-ink">{post.author.name}</span>
            <span className="truncate text-ink-muted">
              {post.author.handle} · {ago(post.createdAt)}
            </span>
            <span className="rounded-full bg-amber/20 px-2 py-0.5 text-[11px] font-medium text-ink">{post.flair}</span>
          </header>

          <div>
            <h2 id={`${post.id}-title`} className="text-lg leading-snug font-semibold text-ink">
              {post.title}
            </h2>
            {post.body && <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-ink-muted">{post.body}</p>}
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-white/45 px-3 py-2">
            <motion.button
              type="button"
              onClick={onPlay}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-page"
              whileTap={reducedMotion ? undefined : { scale: press.scale }}
              transition={press.transition}
              aria-label={`${playing ? 'Pause' : 'Play'} ${post.title}`}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                  <path d="M7.5 5h3.5v14H7.5zM13 5h3.5v14H13z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-4 translate-x-px" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              )}
            </motion.button>
            <Waveform peaks={post.peaks} playing={playing} />
            <span className="shrink-0 text-xs tabular-nums text-ink-muted">{asLength(post.seconds)}</span>
          </div>

          <footer className="-ml-2 flex flex-wrap items-center gap-1 text-xs font-medium text-ink-muted">
            <ActionButton onClick={onToggleComments} pressed={open} label={`${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}>
              <path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z" />
            </ActionButton>
            <ActionButton onClick={() => void share()} label={copied ? 'Link copied' : 'Share'}>
              <path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5.5 12.5v7h13v-7" />
            </ActionButton>
            {post.mine && (
              <ActionButton onClick={onDelete} label="Delete">
                <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7" />
              </ActionButton>
            )}
            <span className="sr-only" aria-live="polite">
              {copied ? 'Link copied to the clipboard' : ''}
            </span>
          </footer>

          {open && <CommentThread postId={post.id} onCount={setCommentCount} />}
        </div>
      </div>
    </motion.article>
  )
}

function ActionButton({ onClick, label, pressed, children }: { onClick: () => void; label: string; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 hover:bg-hairline hover:text-ink ${pressed ? 'bg-hairline text-ink' : ''}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
      {label.replace(/^(\d+)/, (count) => compact(Number(count)))}
    </button>
  )
}
