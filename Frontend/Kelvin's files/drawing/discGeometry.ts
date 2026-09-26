/*
 * Shared shapes for the record disc drawing: the spiral the hum is pressed into (melody traces
 * and note glints in the vinyl's grooves), and small color and easing helpers. All pure.
 */

/** Colors and proportions, read from tokens.css. */
export interface DiscLook {
  fontFamily: string
  /** Label radius as a fraction of the disc radius. */
  labelRatio: number
  liquid: string
  liquidEdge: string
  ripple: string
  glow: string
  vinyl: string
  vinylLip: string
  groove: string
  trace: string
  label: string
  labelInk: string
}

export interface DiscFrame {
  /** Canvas size in CSS pixels (the disc is square). */
  size: number
  look: DiscLook
  /** 0–1: elapsed recording time out of the maximum. */
  fillProgress: number
  /** Mic level samples (0–1), oldest first. */
  levels: readonly number[]
  /** How many level samples a full-length recording has. */
  levelsPerRecording: number
  /** Current mic level (0–1); sizes the glow at the spiral's leading end. */
  liveLevel: number
  /** 0–1: glass → vinyl. */
  pressProgress: number
  reducedMotion: boolean
}

export type NoteKind = 'quarter' | 'eighth' | 'half'

export interface PlacedNote {
  index: number
  radius: number
  angle: number
  size: number
  kind: NoteKind
}

export const TAU = Math.PI * 2

// Geometry, as fractions of the disc radius
const SPIRAL_OUTER = 0.9
const SPIRAL_INNER = 0.38
const SPIRAL_TURNS = 6
const SPIRAL_STEPS = 1500
export const HOLE_RADIUS = 0.026

// Melody lines ride the spiral like a loose staff. Offsets and swing are in spiral-band widths.
export const MELODY_LINES = [
  { offset: -0.28, cycles: 43, phase: 0.4 },
  { offset: 0, cycles: 59, phase: 2.1 },
  { offset: 0.28, cycles: 71, phase: 4.2 },
]
const MELODY_SWING = 0.17

// Notes: chance per level sample and head size (in band widths), from quiet to loud humming
const NOTE_CHANCE_QUIET = 0.06
const NOTE_CHANCE_LOUD = 0.7
const NOTE_SIZE_QUIET = 0.11
const NOTE_SIZE_LOUD = 0.22
const NOTE_SPREAD = 0.55

export function bandWidth(radius: number) {
  return (radius * (SPIRAL_OUTER - SPIRAL_INNER)) / SPIRAL_TURNS
}

/** Point on the spiral: u = 0 at the outer edge (12 o'clock), u = 1 at the inner end. */
function spiralAt(u: number, radius: number) {
  return {
    radius: radius * (SPIRAL_OUTER - (SPIRAL_OUTER - SPIRAL_INNER) * u),
    angle: -Math.PI / 2 + u * SPIRAL_TURNS * TAU,
  }
}

export function traceSpiral(
  ctx: CanvasRenderingContext2D,
  center: number,
  radius: number,
  end: number,
  offset: (u: number) => number,
) {
  const steps = Math.max(2, Math.ceil(SPIRAL_STEPS * end))
  for (let step = 0; step <= steps; step++) {
    const u = (step / steps) * end
    const point = spiralAt(u, radius)
    const r = point.radius + offset(u)
    const x = center + Math.cos(point.angle) * r
    const y = center + Math.sin(point.angle) * r
    if (step === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
}

export function melodyOffset(frame: DiscFrame, line: (typeof MELODY_LINES)[number], u: number, band: number) {
  const swing = Math.sin(u * line.cycles * TAU + line.phase) * MELODY_SWING * levelAt(frame, u)
  return band * (line.offset + swing)
}

/** Mic level at spiral position u, blended between neighbouring samples. */
function levelAt(frame: DiscFrame, u: number) {
  const position = u * frame.levelsPerRecording
  const index = Math.floor(position)
  const current = frame.levels[index] ?? 0
  const next = frame.levels[index + 1] ?? current
  return current + (next - current) * (position - index)
}

/** Notes for every level sample recorded so far; louder samples get more and bigger notes. */
export function placeNotes(frame: DiscFrame, radius: number): PlacedNote[] {
  const band = bandWidth(radius)
  const count = Math.min(frame.levels.length, Math.floor(frame.fillProgress * frame.levelsPerRecording))
  const notes: PlacedNote[] = []

  for (let index = 0; index < count; index++) {
    const level = frame.levels[index]
    if (seeded(index, 0) > lerp(NOTE_CHANCE_QUIET, NOTE_CHANCE_LOUD, level)) continue
    const point = spiralAt((index + seeded(index, 1)) / frame.levelsPerRecording, radius)
    const kindRoll = seeded(index, 4)
    notes.push({
      index,
      radius: point.radius + (seeded(index, 2) - 0.5) * band * NOTE_SPREAD,
      angle: point.angle,
      size: band * lerp(NOTE_SIZE_QUIET, NOTE_SIZE_LOUD, level) * (0.85 + 0.3 * seeded(index, 3)),
      kind: kindRoll < 0.55 ? 'quarter' : kindRoll < 0.8 ? 'eighth' : 'half',
    })
  }
  return notes
}

// ── Helpers ────────────────────────────────────────────────────────────

export function circlePath(ctx: CanvasRenderingContext2D, x: number, radius: number, y = x) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
}

/**
 * The same color at a different opacity. Accepts hex (#rgb, #rgba, #rrggbb, #rrggbbaa; the
 * production build minifies token colors to these) and rgb()/rgba() in either syntax.
 */
export function fade(color: string, alpha: number) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color)?.[1]
  let channels: number[]
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex
    channels = [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16))
  } else {
    channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  }
  return `rgba(${channels.join(', ')}, ${alpha})`
}

/** Deterministic pseudo-random number in [0, 1) for a sample index and a channel. */
function seeded(index: number, channel: number) {
  let t = (index * 7919 + channel * 104_729 + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}
