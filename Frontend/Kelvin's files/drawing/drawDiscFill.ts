/*
 * Pure canvas drawing for the record disc: the same inputs always draw the same picture.
 *
 * Recording: liquid pours into the glass disc and spreads from the center outward, like water in
 * a shallow dish seen from above. It pours at a steady rate, so its area (not its radius) grows
 * with elapsed time. Its edge ripples, and rings travel outward, more strongly the louder the hum.
 * Pressing: the liquid darkens from the center outward into vinyl, the grooves settle in and the
 * amber label appears (drawVinyl, unchanged).
 */
import { TAU, circlePath, clamp01, easeInOutCubic, fade, placeNotes, type DiscFrame } from './discGeometry'
import { drawVinyl } from './drawVinyl'

export type { DiscFrame, DiscLook } from './discGeometry'

// The liquid: how far it can spread (fraction of radius) and how finely its edge is drawn
const LIQUID_MAX = 0.955
const LIQUID_EDGE_POINTS = 180
// The rippling edge: three waves travelling around it, calm when quiet, livelier when loud
const RIPPLE_WAVES = [
  { lobes: 5, speed: 1.1, phase: 0 },
  { lobes: 8, speed: -1.6, phase: 1.9 },
  { lobes: 13, speed: 2.3, phase: 4.2 },
]
const RIPPLE_CALM = 0.004
const RIPPLE_LOUD = 0.03
/** Ripple phase advances this much over a full-length recording. */
const RIPPLE_CLOCK = 14
/** Rings travelling outward from the center, and how bright they get when loud. */
const RING_COUNT = 3
const RING_QUIET = 0.12
const RING_LOUD = 0.5
const MENISCUS_OPACITY = 0.8

// Pressing: softness of the dark front (fraction of radius) and when the label starts to show
const PRESS_EDGE = 0.07
const PRESS_EDGE_OPACITY = 0.5
const LABEL_START = 0.45

export function drawDiscFill(ctx: CanvasRenderingContext2D, frame: DiscFrame): void {
  const { size, pressProgress, reducedMotion } = frame
  ctx.clearRect(0, 0, size, size)
  if (size <= 0) return

  const center = size / 2
  const radius = size / 2

  if (pressProgress <= 0) {
    drawLiquid(ctx, frame, center, radius)
    return
  }

  // the hum pressed into the grooves (melody traces and note glints)
  const notes = placeNotes(frame, radius)
  const labelReveal = clamp01((pressProgress - LABEL_START) / (1 - LABEL_START))

  if (reducedMotion) {
    // no sweeping: the liquid simply fades into a finished record
    ctx.save()
    ctx.globalAlpha = 1 - pressProgress
    drawLiquid(ctx, frame, center, radius)
    ctx.globalAlpha = pressProgress
    drawVinyl(ctx, frame, center, radius, notes, 1)
    ctx.restore()
    return
  }

  const front = easeInOutCubic(pressProgress) * radius * (1 + PRESS_EDGE)
  drawLiquid(ctx, frame, center, radius)

  ctx.save()
  circlePath(ctx, center, Math.min(front, radius))
  ctx.clip()
  drawVinyl(ctx, frame, center, radius, notes, labelReveal)
  ctx.restore()

  if (front < radius) {
    // the liquid darkens just ahead of the front, so the edge is soft
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

/** The pool of liquid, its rippling edge with a bright meniscus, and rings moving outward. */
function drawLiquid(ctx: CanvasRenderingContext2D, frame: DiscFrame, center: number, radius: number) {
  const { look, fillProgress, liveLevel, reducedMotion } = frame
  if (fillProgress <= 0) return

  // with reduced motion the full pool fades in instead of spreading and rippling
  const pool = radius * LIQUID_MAX * (reducedMotion ? 1 : Math.sqrt(fillProgress))
  const wobble = reducedMotion ? 0 : radius * (RIPPLE_CALM + RIPPLE_LOUD * liveLevel)
  const time = fillProgress * RIPPLE_CLOCK

  ctx.save()
  ctx.globalAlpha *= reducedMotion ? fillProgress : 1

  ctx.beginPath()
  for (let step = 0; step <= LIQUID_EDGE_POINTS; step++) {
    const angle = (step / LIQUID_EDGE_POINTS) * TAU
    let swell = 0
    for (const wave of RIPPLE_WAVES) swell += Math.sin(angle * wave.lobes + time * wave.speed + wave.phase)
    const r = Math.min(radius, Math.max(0, pool + (wobble * swell) / RIPPLE_WAVES.length))
    const x = center + Math.cos(angle) * r
    const y = center + Math.sin(angle) * r
    if (step === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()

  const body = ctx.createRadialGradient(center - pool * 0.25, center - pool * 0.3, 0, center, center, pool + wobble)
  body.addColorStop(0, look.liquid)
  body.addColorStop(1, look.liquidEdge)
  ctx.fillStyle = body
  ctx.fill()

  ctx.lineWidth = Math.max(1, radius * 0.008)
  ctx.strokeStyle = look.ripple
  ctx.globalAlpha *= MENISCUS_OPACITY
  ctx.stroke()

  if (!reducedMotion) {
    const baseAlpha = ctx.globalAlpha / MENISCUS_OPACITY
    ctx.lineWidth = 1
    for (let ring = 0; ring < RING_COUNT; ring++) {
      const travel = (time * 0.35 + ring / RING_COUNT) % 1
      ctx.globalAlpha = baseAlpha * (1 - travel) * (RING_QUIET + RING_LOUD * liveLevel)
      circlePath(ctx, center, pool * travel)
      ctx.stroke()
    }
  }
  ctx.restore()
}
