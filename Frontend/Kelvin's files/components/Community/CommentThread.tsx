import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { addComment, ago, listComments, onCommunityChange, voteComment, type Comment, type Vote } from '../../data/community'
import VoteButtons from './VoteButtons'
import Avatar from './Avatar'

/** Past this, replies stop stepping further right so a long back-and-forth stays readable. */
const MAX_INDENT = 4

/**
 * A post's conversation: a box to add to it, then every comment with its replies nested under it.
 * Loaded when the thread is opened, and again whenever someone comments (in any tab).
 */
export default function CommentThread({ postId, onCount }: { postId: string; onCount: (count: number) => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null)

  const load = useCallback(() => {
    listComments(postId).then((found) => {
      setComments(found)
      onCount(found.length)
    })
  }, [postId, onCount])
  useEffect(load, [load])
  useEffect(() => onCommunityChange(load), [load])

  const vote = (comment: Comment, next: Vote) => {
    setComments((current) => current?.map((row) => (row.id === comment.id ? { ...row, vote: next, score: row.score - row.vote + next } : row)) ?? null)
    void voteComment(comment.id, next)
  }

  const reply = async (body: string, parentId: string | null) => {
    await addComment(postId, body, parentId) // the change listener reloads the thread
  }

  const childrenOf = (parentId: string | null) => comments?.filter((comment) => comment.parentId === parentId) ?? []

  const renderBranch = (parentId: string | null, depth: number): React.ReactNode[] =>
    childrenOf(parentId).map((comment) => {
      const replies = renderBranch(comment.id, depth + 1)
      return (
        <CommentItem key={comment.id} comment={comment} depth={depth} onVote={vote} onReply={reply}>
          {replies.length > 0 ? replies : null}
        </CommentItem>
      )
    })

  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-4" aria-label="Comments">
      <Composer placeholder="What did you think of it?" submitLabel="Comment" onSubmit={(body) => reply(body, null)} />
      {comments === null && <p className="text-xs text-ink-muted">Loading comments…</p>}
      {comments?.length === 0 && <p className="text-xs text-ink-muted">No comments yet. Say something nice.</p>}
      <ul className="flex flex-col gap-4">{renderBranch(null, 0)}</ul>
    </section>
  )
}

interface CommentItemProps {
  comment: Comment
  depth: number
  onVote: (comment: Comment, vote: Vote) => void
  onReply: (body: string, parentId: string) => Promise<void>
  children: React.ReactNode
}

function CommentItem({ comment, depth, onVote, onReply, children }: CommentItemProps) {
  const [replying, setReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const nested = depth > 0 && depth <= MAX_INDENT

  return (
    <li className={nested ? '-ml-1 border-l-2 border-hairline pl-4' : ''}>
      <div className="flex items-center gap-2 text-xs">
        <Avatar author={comment.author} size="sm" />
        <span className="font-medium text-ink">{comment.author.name}</span>
        <span className="text-ink-muted">· {ago(comment.createdAt)}</span>
        <button
          type="button"
          onClick={() => setCollapsed((was) => !was)}
          className="ml-auto cursor-pointer rounded-full px-2 text-ink-muted hover:text-ink"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${comment.author.name}'s comment`}
        >
          {collapsed ? '[+]' : '[–]'}
        </button>
      </div>

      {!collapsed && (
        <>
          <p className="mt-1 pl-8 text-sm leading-relaxed whitespace-pre-line text-ink">{comment.body}</p>
          <div className="mt-1 flex items-center gap-2 pl-6">
            <VoteButtons layout="row" score={comment.score} vote={comment.vote} label={`${comment.author.name}'s comment`} onVote={(next) => onVote(comment, next)} />
            <button type="button" onClick={() => setReplying((was) => !was)} className="cursor-pointer rounded-full px-2 py-1 text-xs font-medium text-ink-muted hover:text-ink">
              Reply
            </button>
          </div>
          {replying && (
            <div className="mt-2 pl-8">
              <Composer
                autoFocus
                placeholder={`Reply to ${comment.author.name}`}
                submitLabel="Reply"
                onCancel={() => setReplying(false)}
                onSubmit={async (body) => {
                  await onReply(body, comment.id)
                  setReplying(false)
                }}
              />
            </div>
          )}
          {children && <ul className="mt-3 flex flex-col gap-4">{children}</ul>}
        </>
      )}
    </li>
  )
}

interface ComposerProps {
  placeholder: string
  submitLabel: string
  onSubmit: (body: string) => Promise<void>
  onCancel?: () => void
  autoFocus?: boolean
}

function Composer({ placeholder, submitLabel, onSubmit, onCancel, autoFocus }: ComposerProps) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!body.trim() || sending) return
    setSending(true)
    try {
      await onSubmit(body)
      setBody('')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(event)
          if (event.key === 'Escape') onCancel?.()
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={2}
        maxLength={1000}
        autoFocus={autoFocus}
        className="w-full resize-y rounded-2xl border border-hairline bg-white/60 px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!body.trim() || sending}
          className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-page disabled:cursor-default disabled:opacity-35"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
