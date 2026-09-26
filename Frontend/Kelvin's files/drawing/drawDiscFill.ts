/*
 * Pure canvas drawing for the record disc: the same inputs always draw the same picture.
 * Note placement comes from a seeded random per mic-level sample, never Math.random().
 *
 * Recording: the glass fills from the outer edge inward along a spiral. How far it has filled
 * follows elapsed time; how many notes appear, and how big, follows the mic level at that moment.
 * Pressing: the glass darkens from the center outward into vinyl, the notes and melody lines
 * settle into the grooves, and the amber label appears.
 */
import {
  HOLE_RADIUS,
  MELODY_LINES,
  SPIRAL_STEPS,
  TAU,
  bandWidth,
  circlePath,
  clamp01,
  easeInOutCubic,
  fade,
  melodyOffset,
  placeNotes,
  spiralXY,
  traceSpiral,
  type DiscFrame,
  type DiscLook,
  type PlacedNote,
} from './discGeometry'
import { drawVinyl } from './drawVinyl'

export type { DiscFrame, DiscLook } from './discGeometry'

const MELODY_WIDTH_PX = 0.9
const MELODY_OPACITY = 0.5
const NOTE_FADE_IN_SAMPLES = 5

// Pressing: softness of the dark front, how far ahead of it notes fade (fractions of radius),
// and when the label starts to show
const PRESS_EDGE = 0.07
const PRESS_EDGE_OPACITY = 0.5
const NOTE_SETTLE = 0.16
const LABEL_START = 0.45

export function drawDiscFill(ctx: CanvasRenderingContext2D, frame: DiscFrame): void {
  const { size, pressProgress, reducedMotion } = frame
  ctx.clearRect(0, 0, size, size)
  if (size <= 0) return

  const center = size / 2
  const radius = size / 2
  const notes = placeNotes(frame, radius)

  if (pressProgress <= 0) {
    drawGlassHole(ctx, frame.look, center, radius)
    drawGlassFill(ctx, frame, center, radius, notes, 0)
    return
  }

  const labelReveal = clamp01((pressProgress - LABEL_START) / (1 - LABEL_START))

  if (reducedMotion) {
    // no sweeping: the glass simply fades into a finished record
    ctx.save()
    ctx.globalAlpha = 1 - pressProgress
    drawGlassFill(ctx, frame, center, radius, notes, 0)
    ctx.globalAlpha = pressProgress
    drawVinyl(ctx, frame, center, radius, notes, 1)
    ctx.restore()
    return
  }

  const front = easeInOutCubic(pressProgress) * radius * (1 + PRESS_EDGE)
  drawGlassHole(ctx, frame.look, center, radius)
  drawGlassFill(ctx, frame, center, radius, notes, front)

  ctx.save()
  circlePath(ctx, center, Math.min(front, radius))
  ctx.clip()
  drawVinyl(ctx, frame, center, radius, notes, labelReveal)
  ctx.restore()

  if (front < radius) {
    // the glass darkens just ahead of the front, so the edge is soft
    ctx.save()
    circlePath(ctx, center, radius)
    ctx.clip()
    const edge = ctx.createRadialGradient(center, center, front, center, center, front + radius * PRESS_EDGE)
    edge.addColorStop(0, fade(frame.look.vinyl, PRESS_EDGE_OPACITY))
    edge.addColorStop(1, fade(frame.look.vinyl, 0))
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, size, size)
    ctx.restore()
  }
}

/** The spindle hole in the clear glass: a small drilled ring. */
function drawGlassHole(ctx: CanvasRenderingContext2D, look: DiscLook, center: number, radius: number) {
  ctx.strokeStyle = look.ink
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.arc(center, center, radius * HOLE_RADIUS, 0, TAU)
  ctx.stroke()
}

/** The milky spiral band, melody lines, notes and the glow at the leading end. */
function drawGlassFill(
  ctx: CanvasRenderingContext2D,
  frame: DiscFrame,
  center: number,
  radius: number,
  notes: PlacedNote[],
  front: number,
) {
  const { look, fillProgress, reducedMotion } = frame
  if (fillProgress <= 0) return
  const band = bandWidth(radius)
  const baseAlpha = ctx.globalAlpha

  // with reduced motion the whole band fades in instead of sweeping around
  const bandEnd = reducedMotion ? 1 : fillProgress
  ctx.beginPath()
  traceSpiral(ctx, center, radius, bandEnd, () => 0)
  ctx.globalAlpha = baseAlpha * (reducedMotion ? fillProgress : 1)
  ctx.lineWidth = band
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = look.fill
  ctx.stroke()
  if (bandEnd < 1) {
    // round only the moving end, as a half circle facing forward so it doesn't overlap the band
    const end = spiralXY(bandEnd, center, radius)
    const before = spiralXY(bandEnd - 1 / SPIRAL_STEPS, center, radius)
    const heading = Math.atan2(end.y - before.y, end.x - before.x)
    ctx.fillStyle = look.fill
    ctx.beginPath()
    ctx.arc(end.x, end.y, band / 2, heading - Math.PI / 2, heading + Math.PI / 2)
    ctx.fill()
  }

  ctx.globalAlpha = baseAlpha * MELODY_OPACITY
  ctx.lineWidth = MELODY_WIDTH_PX
  ctx.strokeStyle = look.ink
  for (const line of MELODY_LINES) {
    ctx.beginPath()
    traceSpiral(ctx, center, radius, fillProgress, (u) => melodyOffset(frame, line, u, band))
    ctx.stroke()
  }

  const newestIndex = Math.min(frame.levels.length, frame.fillProgress * frame.levelsPerRecording) - 1
  ctx.fillStyle = look.ink
  for (const note of notes) {
    const fadeIn = clamp01((newestIndex - note.index + 1) / NOTE_FADE_IN_SAMPLES)
    const settle = front > 0 ? clamp01((note.radius - front) / (radius * NOTE_SETTLE)) : 1
    const alpha = fadeIn * settle
    if (alpha <= 0) continue
    ctx.globalAlpha = baseAlpha * alpha
    drawNote(ctx, center, note)
  }
  ctx.globalAlpha = baseAlpha

  const recording = frame.pressProgress <= 0 && fillProgress < 1
  if (recording && !reducedMotion) {
    const { x, y } = spiralXY(fillProgress, center, radius)
    const glowRadius = band * (0.7 + 0.9 * frame.liveLevel)
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius)
    glow.addColorStop(0, look.glow)
    glow.addColorStop(1, fade(look.glow, 0))
    ctx.fillStyle = glow
    circlePath(ctx, x, glowRadius, y)
    ctx.fill()
  }
}

/** A note as vector paths: a tilted oval head, a stem pointing away from the center, maybe a flag. */
function drawNote(ctx: CanvasRenderingContext2D, center: number, note: PlacedNote) {
  const { size, kind } = note
  const headWidth = size * 1.3
  const stemX = headWidth * 0.9
  const stemTop = -size * 3.2

  ctx.save()
  ctx.translate(center + Math.cos(note.angle) * note.radius, center + Math.sin(note.angle) * note.radius)
  ctx.rotate(note.angle + Math.PI / 2)
  ctx.strokeStyle = ctx.fillStyle

  ctx.beginPath()
  ctx.ellipse(0, 0, headWidth, size * 0.92, -0.35, 0, TAU)
  if (kind === 'half') {
    ctx.lineWidth = size * 0.38
    ctx.stroke()
  } else {
    ctx.fill()
  }

  ctx.lineWidth = Math.max(0.6, size * 0.24)
  ctx.beginPath()
  ctx.moveTo(stemX, -size * 0.2)
  ctx.lineTo(stemX, stemTop)
  ctx.stroke()

  if (kind === 'eighth') {
    ctx.lineWidth = size * 0.32
    ctx.beginPath()
    ctx.moveTo(stemX, stemTop)
    ctx.bezierCurveTo(stemX + size * 1.2, stemTop + size * 0.9, stemX + size * 1.5, stemTop + size * 1.8, stemX + size * 0.7, stemTop + size * 2.6)
    ctx.stroke()
  }
  ctx.restore()
}
