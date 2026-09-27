/*
 * The shapes behind the notes graph, worked out in plain numbers so they can be tested without a
 * canvas (drawNotesGraph.ts paints them, NotesGraph.tsx puts it on the page).
 *
 * The line is the hum's own pitch track, frame by frame, not the notes it was rounded into: every
 * scoop into a note and every wobble inside one stays visible. It is smoothed just enough to lose
 * the single-frame jitter of the pitch detector, and its thickness and opacity follow how loud
 * that moment was. Where the melody moves to a new note, a mark sits on the line.
 *
 * Everything is in CSS pixels inside `width` × `height`; the canvas scales for retina itself.
 * noteAt() finds the note under the pointer, so hovering the graph can name it.
 */
import type { Contour, Note, SongNotes } from '../api/talk'

export interface Point {
  x: number
  y: number
}

/** A point on the line, with how loud (0–1) the hum was there. */
export interface ContourPoint extends Point {
  level: number
}

/** A note change: where it sits on the line and how big and solid the mark is. */
export interface Mark extends Point {
  radius: number
  opacity: number
  /** The pitch steps up from the note before it (null for the first note of a phrase). */
  rising: boolean | null
}

/** A note the finished song plays, as a bar on the same time and pitch axes. */
export interface PlayedBar {
  left: number
  right: number
  y: number
  midi: number
}

/** A hummed note's stretch of the line: from where it starts to where it ends, and its pitch. */
export interface SungSpan {
  left: number
  right: number
  midi: number
}

export interface MelodyShapes {
  /** One entry per phrase: a run of sound with silence either side. */
  phrases: ContourPoint[][]
  marks: Mark[]
  /** The hummed notes along the line, for naming the one under the pointer. */
  sung: SungSpan[]
  played: PlayedBar[]
  /** Faint horizontal guides an octave apart — position only, never labelled. */
  octaves: number[]
  /** True when the song's notes sit somewhere other than the hummed ones (a fader moved the tune). */
  moved: boolean
}

export interface Bounds {
  width: number
  height: number
  padding: { left: number; right: number; top: number; bottom: number }
}

/** Below this the pitch track is noise rather than a note, and a mark would be meaningless. */
const MIN_PHRASE_POINTS = 3
/** Half a semitone: less than this either side of a note is the singer holding it, not moving. */
const SMOOTH_SEMITONES = 0.5
/** A mark is never smaller than this, so a quiet note is still visible. */
const MIN_MARK_RADIUS = 2.2
const MAX_MARK_RADIUS = 6.5
/** Pitch room above and below what was sung, so the line never touches the edge. */
const PITCH_MARGIN = 1.5

/**
 * Everything the graph draws, or null when there is nothing to draw yet. `notes.contour` is the
 * detail; without it (an older backend) the hummed notes themselves are stepped into a line, so
 * the graph still works.
 */
export function melodyShapes(notes: SongNotes, bounds: Bounds): MelodyShapes | null {
  const contour = usableContour(notes)
  const all = [...notes.sung, ...notes.played]
  if (contour.segments.length === 0 && all.length === 0) return null

  const times = contourTimes(contour)
  const pitches = contourPitches(contour)
  const end = Math.max(...times, ...all.map((n) => n.start + n.duration), 0.001)
  const low = Math.min(...pitches, ...all.map((n) => n.midi)) - PITCH_MARGIN
  const high = Math.max(...pitches, ...all.map((n) => n.midi)) + PITCH_MARGIN

  const { width, height, padding } = bounds
  const plotWidth = Math.max(1, width - padding.left - padding.right)
  const plotHeight = Math.max(1, height - padding.top - padding.bottom)
  const x = (seconds: number) => padding.left + (seconds / end) * plotWidth
  const y = (midi: number) => padding.top + ((high - midi) / Math.max(high - low, 1)) * plotHeight

  const phrases = contour.segments
    .map((segment) => phrasePoints(segment, contour.step, x, y))
    .filter((phrase) => phrase.length >= MIN_PHRASE_POINTS)

  return {
    phrases,
    marks: marks(notes.sung, phrases, x, y),
    sung: notes.sung.map((n) => ({ left: x(n.start), right: x(n.start + n.duration), midi: n.midi })),
    played: notes.played.map((n) => ({ left: x(n.start), right: x(n.start + n.duration), y: y(n.midi), midi: n.midi })),
    octaves: octaveLines(low, high, y),
    moved: hasMoved(notes),
  }
}

/** The contour the backend sent, or one stepped out of the hummed notes when it sent none. */
function usableContour(notes: SongNotes): Contour {
  if (notes.contour && notes.contour.segments.length > 0) return notes.contour
  const step = 0.02
  return {
    step,
    segments: notes.sung.map((note) => {
      const frames = Math.max(MIN_PHRASE_POINTS, Math.round(note.duration / step))
      return { start: note.start, midi: Array<number>(frames).fill(note.midi), level: Array<number>(frames).fill(0.7) }
    }),
  }
}

function contourTimes(contour: Contour): number[] {
  return contour.segments.map((s) => s.start + (s.midi.length - 1) * contour.step)
}

function contourPitches(contour: Contour): number[] {
  return contour.segments.flatMap((s) => s.midi)
}

/** One phrase as points, with the pitch detector's single-frame jitter averaged out. */
function phrasePoints(
  segment: Contour['segments'][number],
  step: number,
  x: (seconds: number) => number,
  y: (midi: number) => number,
): ContourPoint[] {
  const smoothed = smooth(segment.midi, Math.max(1, Math.round(0.05 / Math.max(step, 0.001))))
  return smoothed.map((midi, i) => ({
    x: x(segment.start + i * step),
    y: y(midi),
    level: segment.level[i] ?? 0,
  }))
}

/**
 * A moving average that leaves real steps alone: frames further than half a semitone from the
 * middle of the window are left out of it, so a jump to a new note stays a jump while a vibrato
 * inside one note cancels itself out.
 */
export function smooth(values: number[], radius: number): number[] {
  if (radius < 1) return values
  return values.map((value, i) => {
    let total = 0
    let count = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      if (Math.abs(values[j] - value) <= SMOOTH_SEMITONES) {
        total += values[j]
        count++
      }
    }
    return count > 0 ? total / count : value
  })
}

/** A mark on the line where each hummed note starts, sized and faded by how loud the hum was there. */
function marks(sung: Note[], phrases: ContourPoint[][], x: (s: number) => number, y: (m: number) => number): Mark[] {
  return sung.map((note, i) => {
    const at = x(note.start + note.duration / 2)
    const on = nearestPoint(phrases, at)
    const level = on?.level ?? 0.6
    const before = sung[i - 1]
    return {
      x: on?.x ?? at,
      y: on?.y ?? y(note.midi),
      radius: MIN_MARK_RADIUS + level * (MAX_MARK_RADIUS - MIN_MARK_RADIUS),
      opacity: 0.35 + level * 0.65,
      rising: before ? note.midi > before.midi : null,
    }
  })
}

/** The point on the drawn line closest to `at`, so a mark sits on the line and not beside it. */
function nearestPoint(phrases: ContourPoint[][], at: number): ContourPoint | null {
  let best: ContourPoint | null = null
  let distance = Infinity
  for (const phrase of phrases) {
    for (const point of phrase) {
      const away = Math.abs(point.x - at)
      if (away < distance) {
        distance = away
        best = point
      }
    }
  }
  return best
}

/** Guide lines an octave apart, covering the pitches on screen. */
function octaveLines(low: number, high: number, y: (midi: number) => number): number[] {
  const first = Math.ceil(low / 12) * 12
  const lines: number[] = []
  for (let midi = first; midi <= high; midi += 12) lines.push(y(midi))
  return lines
}

/** Whether the song's notes have been moved off the hummed ones (the pitch or speed faders). */
function hasMoved({ sung, played }: SongNotes): boolean {
  if (sung.length !== played.length) return played.length > 0
  return played.some((n, i) => Math.abs(n.midi - sung[i].midi) > 0.01 || Math.abs(n.start - sung[i].start) > 0.01)
}

/** How close the pointer must be to the amber line or a grey bar (CSS pixels) to count as on it. */
const HOVER_REACH = 8
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** A note under the pointer: whether it's hummed (amber) or played by the song (grey), where to show its name, and the name. */
export interface HoveredNote {
  kind: 'sung' | 'played'
  x: number
  y: number
  name: string
  /** For a hummed note: how far off the note it was sung, in words, if it was noticeably off. */
  tuning: string | null
}

/** "C4" for MIDI 60, "F♯3" for 54: the nearest note to a (possibly fractional) MIDI pitch. */
export function noteName(midi: number): string {
  const nearest = Math.round(midi)
  return `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`
}

/**
 * The note under the pointer (x, y in the graph's CSS pixels), or null. On the amber line it's the
 * hummed note sung at that moment; on a grey bar, the note the song plays there. The nearer wins.
 */
export function noteAt(shapes: MelodyShapes, x: number, y: number): HoveredNote | null {
  let found: HoveredNote | null = null
  let nearest = HOVER_REACH
  for (const phrase of shapes.phrases) {
    for (const point of phrase) {
      const away = Math.hypot(point.x - x, point.y - y)
      if (away > nearest) continue
      const note = shapes.sung.find((span) => point.x >= span.left && point.x <= span.right) ?? closestSpan(shapes.sung, point.x)
      if (!note) continue
      nearest = away
      found = { kind: 'sung', x: point.x, y: point.y, name: noteName(note.midi), tuning: offTune(note.midi) }
    }
  }
  for (const bar of shapes.played) {
    const away = Math.abs(bar.y - y)
    if (x < bar.left - HOVER_REACH || x > bar.right + HOVER_REACH || away > nearest) continue
    nearest = away
    found = { kind: 'played', x: Math.min(Math.max(x, bar.left), bar.right), y: bar.y, name: noteName(bar.midi), tuning: null }
  }
  return found
}

function closestSpan(spans: SungSpan[], x: number): SungSpan | null {
  let best: SungSpan | null = null
  let distance = Infinity
  for (const span of spans) {
    const away = x < span.left ? span.left - x : x > span.right ? x - span.right : 0
    if (away < distance) {
      distance = away
      best = span
    }
  }
  return best
}

/** "a little sharp" or "a little flat" when a hummed note was a fifth of a semitone or more off. */
function offTune(midi: number): string | null {
  const off = midi - Math.round(midi)
  if (Math.abs(off) < 0.2) return null
  return off > 0 ? 'a little sharp' : 'a little flat'
}
