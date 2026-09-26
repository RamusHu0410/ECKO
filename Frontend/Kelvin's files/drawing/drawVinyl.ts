/*
 * The finished record: near-black body, fine concentric grooves with the hum pressed into
 * them, a raised lip, the amber label and the spindle hole. Pure drawing, no state.
 */
import {
  HOLE_RADIUS,
  MELODY_LINES,
  TAU,
  bandWidth,
  circlePath,
  easeOutCubic,
  fade,
  melodyOffset,
  traceSpiral,
  type DiscFrame,
  type DiscLook,
  type PlacedNote,
} from './discGeometry'

// Grooved area, gaps between tracks and the outer lip, as fractions of the disc radius
const GROOVES_INNER = 0.37
const GROOVES_OUTER = 0.955
const TRACK_GAPS = [0.58, 0.77]
const LIP_INNER = 0.972

// Pixel sizes of fine details
const GROOVE_SPACING_PX = 1
const GROOVE_WIDTH_PX = 0.5
const TRACK_GAP_WIDTH_PX = 3
const TRACE_WIDTH_PX = 0.7

export function drawVinyl(
  ctx: CanvasRenderingContext2D,
  frame: DiscFrame,
  center: number,
  radius: number,
  notes: PlacedNote[],
  labelReveal: number,
) {
  const { look } = frame

  ctx.fillStyle = look.vinyl
  circlePath(ctx, center, radius)
  ctx.fill()

  // fine concentric grooves, with a couple of smooth gaps between tracks
  ctx.strokeStyle = look.groove
  ctx.lineWidth = GROOVE_WIDTH_PX
  ctx.beginPath()
  for (let r = radius * GROOVES_INNER; r < radius * GROOVES_OUTER; r += GROOVE_SPACING_PX) {
    if (TRACK_GAPS.some((gap) => Math.abs(r - radius * gap) < TRACK_GAP_WIDTH_PX)) continue
    ctx.moveTo(center + r, center)
    ctx.arc(center, center, r, 0, TAU)
  }
  ctx.stroke()
  ctx.lineWidth = TRACK_GAP_WIDTH_PX
  for (const gap of TRACK_GAPS) {
    ctx.beginPath()
    ctx.arc(center, center, radius * gap, 0, TAU)
    ctx.stroke()
  }

  // the hum, pressed in: melody lines become faint groove waves, notes become short glints
  const band = bandWidth(radius)
  ctx.strokeStyle = look.trace
  ctx.lineWidth = TRACE_WIDTH_PX
  for (const line of MELODY_LINES) {
    ctx.beginPath()
    traceSpiral(ctx, center, radius, frame.fillProgress, (u) => melodyOffset(frame, line, u, band) * 0.5)
    ctx.stroke()
  }
  for (const note of notes) {
    const halfSweep = (note.size * 2.2) / note.radius
    ctx.lineWidth = Math.max(TRACE_WIDTH_PX, note.size * 0.35)
    ctx.beginPath()
    ctx.arc(center, center, note.radius, note.angle - halfSweep, note.angle + halfSweep)
    ctx.stroke()
  }

  // thin raised lip at the outer edge
  ctx.fillStyle = look.vinylLip
  ctx.beginPath()
  ctx.arc(center, center, radius, 0, TAU)
  ctx.arc(center, center, radius * LIP_INNER, 0, TAU, true)
  ctx.fill()
  ctx.strokeStyle = look.groove
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(center, center, radius * (LIP_INNER + (1 - LIP_INNER) * 0.45), 0, TAU)
  ctx.stroke()

  if (labelReveal > 0) drawLabel(ctx, look, center, radius, labelReveal)
  punchSpindleHole(ctx, look, center, radius)
}

/** The amber paper label, printed with the app name so the spin is visible. */
function drawLabel(ctx: CanvasRenderingContext2D, look: DiscLook, center: number, radius: number, reveal: number) {
  const shown = easeOutCubic(reveal)
  const labelRadius = radius * look.labelRatio * (0.86 + 0.14 * shown)

  ctx.save()
  ctx.globalAlpha *= shown
  ctx.fillStyle = look.label
  circlePath(ctx, center, labelRadius)
  ctx.fill()

  const paper = ctx.createRadialGradient(
    center - labelRadius * 0.3, center - labelRadius * 0.35, 0,
    center, center, labelRadius,
  )
  paper.addColorStop(0, fade(look.glow, 0.28))
  paper.addColorStop(1, fade(look.glow, 0))
  ctx.fillStyle = paper
  ctx.fill()

  ctx.strokeStyle = look.labelInk
  ctx.lineWidth = 0.75
  for (const ring of [0.93, 0.64]) {
    ctx.beginPath()
    ctx.arc(center, center, labelRadius * ring, 0, TAU)
    ctx.stroke()
  }

  ctx.fillStyle = look.labelInk
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${labelRadius * 0.2}px ${look.fontFamily}`
  ctx.fillText('ECKO', center, center - labelRadius * 0.45)
  ctx.font = `500 ${labelRadius * 0.11}px ${look.fontFamily}`
  ctx.fillText('SIDE A', center, center + labelRadius * 0.47)
  ctx.restore()
}

function punchSpindleHole(ctx: CanvasRenderingContext2D, look: DiscLook, center: number, radius: number) {
  const holeRadius = radius * HOLE_RADIUS
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  circlePath(ctx, center, holeRadius)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = look.vinyl
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(center, center, holeRadius + 0.5, 0, TAU)
  ctx.stroke()
}
