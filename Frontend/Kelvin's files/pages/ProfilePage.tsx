import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import RecordRow from '../components/RecordRow/RecordRow'
import BackdropPicker from '../components/BackdropPicker/BackdropPicker'
import { useRecordPlayer } from '../hooks/useRecordPlayer'
import { audioUrl, deleteRecord, describeRecord, listRecords, type SavedRecord } from '../data/records'
import { me } from '../data/profile'
import { useLinkTo } from '../routing/useRoute'
import { appear } from '../design/motion'

/**
 * This person and everything they have made. The records are the ones kept in this browser
 * (data/records.ts), each playable without leaving the page.
 */
export default function ProfilePage() {
  const person = me()
  const [records, setRecords] = useState<SavedRecord[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const player = useRecordPlayer()
  const studioLink = useLinkTo('home')

  const load = useCallback(() => {
    listRecords().then(
      (found) => {
        setRecords(found)
        setProblem(null)
      },
      (error: Error) => {
        setRecords([])
        setProblem(error.message)
      },
    )
  }, [])
  useEffect(load, [load])

  const forget = async (record: SavedRecord) => {
    if (player.playingId === record.id) player.stop()
    await deleteRecord(record.id)
    load()
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-5 pt-28 pb-16 lg:px-12">
      <motion.header className="flex items-center gap-5" {...appear}>
        {/* TODO(backend): a real avatar image once accounts exist. */}
        <span className="grid size-20 shrink-0 place-items-center rounded-full bg-ink font-display text-3xl text-page" aria-hidden="true">
          {person.initials}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-4xl text-ink">{person.name}</h1>
          <p className="text-sm text-ink-muted">{person.handle}</p>
          <p className="mt-1 text-sm text-ink-muted">{person.bio}</p>
        </div>
      </motion.header>

      <BackdropPicker />

      <section aria-labelledby="my-records" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="my-records" className="text-xs font-semibold tracking-widest text-ink-muted uppercase">
            My records
          </h2>
          {records && records.length > 0 && (
            <span className="text-xs text-ink-muted">
              {records.length} {records.length === 1 ? 'record' : 'records'}
            </span>
          )}
        </div>

        {records === null && <p className="text-sm text-ink-muted">Looking for your records…</p>}

        {records?.length === 0 && (
          <motion.div className="glass-surface glass-panel px-6 py-8 text-center" {...appear}>
            <div className="glass-content flex flex-col items-center gap-3">
              <p className="text-sm text-ink-muted">{problem ?? 'Nothing here yet. Hum something and it will be saved to this page.'}</p>
              <a {...studioLink} className="glass-surface glass-control cursor-pointer px-6 py-2.5 text-base font-medium text-ink">
                <span className="glass-content">Hum your first tune</span>
              </a>
            </div>
          </motion.div>
        )}

        <ul className="flex flex-col gap-3">
          {records?.map((record) => (
            <RecordRow
              key={record.id}
              title={record.title}
              detail={describeRecord(record)}
              seconds={record.seconds}
              playing={player.playingId === record.id}
              onPlay={() => player.toggle(record.id, () => audioUrl(record))}
            >
              <button
                type="button"
                onClick={() => void forget(record)}
                className="shrink-0 cursor-pointer rounded-full px-2 py-1 text-xs text-ink-muted hover:text-ink"
                aria-label={`Delete ${record.title}`}
              >
                Delete
              </button>
            </RecordRow>
          ))}
        </ul>
      </section>
    </main>
  )
}
