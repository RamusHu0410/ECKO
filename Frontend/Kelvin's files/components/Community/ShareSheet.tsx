import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLAIRS, sharePost, type Flair, type Post } from '../../data/community'
import { listRecords, type SavedRecord } from '../../data/records'
import { asLength } from '../RecordRow/RecordRow'
import GlassButton from '../GlassButton/GlassButton'

interface ShareSheetProps {
  open: boolean
  onClose: () => void
  /** Called with the new post once it is on the board. */
  onShared?: (post: Post) => void
  /**
   * The song to share, straight from the studio once a recording is finished. Without one, the
   * sheet offers the records saved on the profile to choose from.
   */
  audio?: Blob | null
  /** The profile record `audio` was saved as, when known. */
  recordId?: string
  /** A starting title, such as the record's name. */
  defaultTitle?: string
}

/**
 * "Share to community": a title, a few words, a flair, and the song, posted to the board.
 *
 * Self-contained so the studio can open it the moment a recording is done:
 *   <ShareSheet open={sharing} audio={song} onClose={() => setSharing(false)} />
 * The feed (pages/CommunityPage.tsx) hears about the new post by itself, even in another tab.
 */
export default function ShareSheet({ open, onClose, onShared, audio = null, recordId, defaultTitle = '' }: ShareSheetProps) {
  return (
    <AnimatePresence>
      {open && <Sheet onClose={onClose} onShared={onShared} audio={audio} recordId={recordId} defaultTitle={defaultTitle} />}
    </AnimatePresence>
  )
}

function Sheet({ onClose, onShared, audio, recordId, defaultTitle }: Omit<ShareSheetProps, 'open'> & { audio: Blob | null; defaultTitle: string }) {
  const [title, setTitle] = useState(defaultTitle)
  const [body, setBody] = useState('')
  const [flair, setFlair] = useState<Flair>(FLAIRS[0])
  const [records, setRecords] = useState<SavedRecord[] | null>(null)
  const [chosen, setChosen] = useState<SavedRecord | null>(null)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  // no song handed in: offer the ones on the profile
  useEffect(() => {
    if (audio) return
    listRecords().then(
      (found) => {
        setRecords(found)
        if (found[0]) pick(found[0])
      },
      () => setRecords([]),
    )
  }, [audio])

  useEffect(() => {
    titleRef.current?.focus()
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const pick = (record: SavedRecord) => {
    setChosen(record)
    // carry the record's name over until someone types their own
    setTitle((current) => (!current || current.startsWith('Record ·') ? record.title : current))
  }

  const song = audio ?? chosen?.audio ?? null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!song || !title.trim() || sending) return
    setSending(true)
    setProblem(null)
    try {
      const post = await sharePost({ audio: song, title, body, flair, recordId: audio ? recordId : chosen?.id })
      onShared?.(post)
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'It could not be shared.')
      setSending(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-3 backdrop-blur-md sm:place-items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="glass-surface glass-panel max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto px-5 py-6 sm:px-7"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
      >
        <div className="glass-content flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="share-title" className="font-display text-3xl text-ink">
                Share to community
              </h2>
              <p className="text-sm text-ink-muted">Everyone on the board can play it, vote on it and comment.</p>
            </div>
            <button type="button" onClick={onClose} className="-mr-2 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-hairline hover:text-ink" aria-label="Close">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          {!audio && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-semibold tracking-widest text-ink-muted uppercase">Which record</legend>
              {records === null && <p className="text-sm text-ink-muted">Looking for your records…</p>}
              {records?.length === 0 && <p className="text-sm text-ink-muted">Nothing saved yet. Hum something in the studio first, then share it here.</p>}
              <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
                {records?.map((record) => (
                  <label
                    key={record.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm ${chosen?.id === record.id ? 'border-amber bg-amber/10' : 'border-hairline hover:bg-white/50'}`}
                  >
                    <input type="radio" name="record" className="accent-amber" checked={chosen?.id === record.id} onChange={() => pick(record)} />
                    <span className="min-w-0 flex-1 truncate text-ink">{record.title}</span>
                    <span className="text-xs tabular-nums text-ink-muted">{asLength(record.seconds)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-widest text-ink-muted uppercase">Title</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
              placeholder="What is it called?"
              className="rounded-2xl border border-hairline bg-white/60 px-4 py-2.5 text-base text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-widest text-ink-muted uppercase">
              A few words <span className="font-normal tracking-normal normal-case">(optional)</span>
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Where it came from, what you'd like to hear back…"
              className="resize-y rounded-2xl border border-hairline bg-white/60 px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-widest text-ink-muted uppercase">Flair</legend>
            <div className="flex flex-wrap gap-2">
              {FLAIRS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFlair(option)}
                  aria-pressed={flair === option}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${flair === option ? 'border-ink bg-ink text-page' : 'border-hairline text-ink hover:bg-white/60'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          {problem && (
            <p className="text-sm text-ink" role="alert">
              {problem}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="cursor-pointer rounded-full px-4 text-sm font-medium text-ink-muted hover:text-ink">
              Cancel
            </button>
            <GlassButton type="submit" disabled={!song || !title.trim() || sending} className="disabled:cursor-default disabled:opacity-50">
              {sending ? 'Posting…' : 'Post'}
            </GlassButton>
          </div>
        </div>
      </motion.form>
    </motion.div>
  )
}
