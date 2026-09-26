import type { Note, SongNotes } from '../../api/talk'

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const WIDTH = 640
const HEIGHT = 260
const PAD = { left: 36, right: 12, top: 36, bottom: 24 }

type Scale = (value: number) => number

/** "G3" for MIDI 55, rounding to the nearest note. */
function noteName(midi: number) {
  const note = Math.round(midi)
  return `${NAMES[note % 12]}${Math.floor(note / 12) - 1}`
}

/** from, from + step, … up to `to`. */
function steps(from: number, to: number, step: number) {
  return Array.from({ length: Math.max(0, Math.floor((to - from) / step) + 1) }, (_, i) => from + i * step)
}

/**
 * Prototype, for finding bugs: the notes heard in the hum on a time × pitch graph, each labelled
 * with its name. When the sliders move the tune (pitch or speed), the notes the song now plays are
 * drawn in amber over the hummed ones (grey, dashed). Hover a note for its exact pitch and timing.
 */
export default function NotesGraph({ notes }: { notes: SongNotes }) {
  const { sung, played } = notes
  const all = [...sung, ...played]
  if (all.length === 0) return null

  const low = Math.floor(Math.min(...all.map((n) => n.midi))) - 1
  const high = Math.ceil(Math.max(...all.map((n) => n.midi))) + 1
  const end = Math.max(...all.map((n) => n.start + n.duration))
  const x: Scale = (seconds) => PAD.left + (seconds / end) * (WIDTH - PAD.left - PAD.right)
  const y: Scale = (midi) => PAD.top + ((high - midi) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom)
  const moved = played.some((n, i) => Math.abs(n.midi - sung[i].midi) > 0.01 || Math.abs(n.start - sung[i].start) > 0.01)
  const muted = 'var(--color-ink-muted)'

  return (
    <figure className="glass-surface glass-panel w-full max-w-2xl px-6 py-5">
      <div className="glass-content">
        <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
          <span className="font-semibold tracking-widest uppercase">Notes · prototype</span>
          <span>{moved ? 'grey dashed: as you hummed · amber: what the song plays' : 'as you hummed them, and as the song plays them'}</span>
        </figcaption>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mt-3 h-auto w-full" role="img" aria-label={`Notes: ${played.map((n) => noteName(n.midi)).join(', ')}`}>
          {steps(Math.ceil(low / 12) * 12, high, 12).map((c) => (
            <g key={c}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(c)} y2={y(c)} stroke={muted} strokeOpacity={0.3} />
              <text x={PAD.left - 6} y={y(c) + 4} textAnchor="end" fontSize={11} fill={muted}>
                {noteName(c)}
              </text>
            </g>
          ))}
          {steps(0, end, 1).map((second) => (
            <text key={second} x={x(second)} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fill={muted}>
              {second}s
            </text>
          ))}
          {moved && <Tune notes={sung} x={x} y={y} color={muted} dashed />}
          <Tune notes={played} x={x} y={y} color="var(--color-amber)" labelled />
        </svg>
      </div>
    </figure>
  )
}

interface TuneProps {
  notes: Note[]
  x: Scale
  y: Scale
  color: string
  dashed?: boolean
  labelled?: boolean
}

/** A line through the middle of each note, a bar for how long each lasts, and optional name tags. */
function Tune({ notes, x, y, color, dashed = false, labelled = false }: TuneProps) {
  const middle = (n: Note) => x(n.start + n.duration / 2)
  return (
    <g>
      <polyline
        points={notes.map((n) => `${middle(n)},${y(n.midi)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? '6 5' : undefined}
      />
      {notes.map((n, i) => (
        <g key={i}>
          <title>{`${noteName(n.midi)} (MIDI ${n.midi}) · ${n.start.toFixed(2)}–${(n.start + n.duration).toFixed(2)} s`}</title>
          <line x1={x(n.start)} x2={x(n.start + n.duration)} y1={y(n.midi)} y2={y(n.midi)} stroke={color} strokeWidth={6} strokeLinecap="round" strokeOpacity={0.35} />
          <circle cx={middle(n)} cy={y(n.midi)} r={4} fill={color} />
          {labelled && (
            <>
              <rect x={middle(n) - 17} y={y(n.midi) - 28} width={34} height={18} rx={6} fill="var(--color-page)" stroke="var(--color-ink)" strokeOpacity={0.45} />
              <text x={middle(n)} y={y(n.midi) - 15} textAnchor="middle" fontSize={11} fill="var(--color-ink)">
                {noteName(n.midi)}
              </text>
            </>
          )}
        </g>
      ))}
    </g>
  )
}
