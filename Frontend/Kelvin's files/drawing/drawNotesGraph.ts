/*
 * Pure canvas drawing for the notes graph: the same inputs always draw the same picture, so it is
 * equally at home on the page and as a texture on something in 3D.
 *
 * The hum is one amber ribbon whose thickness and glow follow how loud each moment was, with a
 * thin bright core down the middle so quiet passages stay readable. Where the melody moves to a
 * new note a soft dot sits on the line. Underneath, the notes the finished song plays are drawn
 * as flat grey bars — so a moved fader shows as the song stepping away from the hum.
 *
 * Nothing here is labelled: no note names, no numbers. The picture is the point.
 */
import type { ContourPoint, MelodyShapes, Mark, PlayedBar } from './melodyContour'

export interface NotesGraphLook {
  line: string
  glow: string
  played: string
  guide: string
}

/** Thickest and thinnest the ribbon gets, in CSS pixels either side of the line. */
const RIBBON_MIN = 0.7
const RIBBON_MAX = 5
const CORE_WIDTH = 1.4
const GLOW_BLUR = 9
const GUIDE_OPACITY = 0.16
const PLAYED_WIDTH = 3
const PLAYED_OPACITY = 0.3

/** Paints one frame. `ctx` is already scaled for retina, so everything here is in CSS pixels. */
export function drawNotesGraph(ctx: CanvasRenderingContext2D, shapes: MelodyShapes, look: NotesGraphLook, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  guides(ctx, shapes.octaves, look, width)
  // only worth drawing once a fader has moved the song off the hum; otherwise it just doubles the line
  if (shapes.moved) for (const bar of shapes.played) playedBar(ctx, bar, look)
  for (const phrase of shapes.phrases) ribbon(ctx, phrase, look)
  for (const phrase of shapes.phrases) core(ctx, phrase, look)
  for (const mark of shapes.marks) dot(ctx, mark, look)
}

/** Faint full-width lines an octave apart: a sense of how far the tune travels, with no labels. */
function guides(ctx: CanvasRenderingContext2D, octaves: number[], look: NotesGraphLook, width: number): void {
  ctx.save()
  ctx.globalAlpha = GUIDE_OPACITY
  ctx.strokeStyle = look.guide
  ctx.lineWidth = 1
  for (const y of octaves) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  ctx.restore()
}

function playedBar(ctx: CanvasRenderingContext2D, bar: PlayedBar, look: NotesGraphLook): void {
  ctx.save()
  ctx.globalAlpha = PLAYED_OPACITY
  ctx.strokeStyle = look.played
  ctx.lineWidth = PLAYED_WIDTH
  ctx.beginPath()
  ctx.moveTo(bar.left, bar.y)
  ctx.lineTo(bar.right, bar.y)
  ctx.stroke()
  ctx.restore()
}

/**
 * The loud ribbon: one closed shape running out along the top of the line and back along the
 * bottom, its half-width set by the loudness at each point. Filling one shape (rather than
 * stroking each step separately) keeps the edge smooth where the loudness changes quickly.
 */
function ribbon(ctx: CanvasRenderingContext2D, phrase: ContourPoint[], look: NotesGraphLook): void {
  const half = (point: ContourPoint) => RIBBON_MIN + point.level * (RIBBON_MAX - RIBBON_MIN)
  ctx.save()
  ctx.fillStyle = look.line
  ctx.globalAlpha = 0.55
  ctx.shadowColor = look.glow
  ctx.shadowBlur = GLOW_BLUR
  ctx.beginPath()
  edge(ctx, phrase, (point) => point.y - half(point), false)
  edge(ctx, phrase, (point) => point.y + half(point), true)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** The bright thread down the middle of the ribbon, so a quiet phrase is still a clear line. */
function core(ctx: CanvasRenderingContext2D, phrase: ContourPoint[], look: NotesGraphLook): void {
  ctx.save()
  ctx.strokeStyle = look.line
  ctx.lineWidth = CORE_WIDTH
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  edge(ctx, phrase, (point) => point.y, false)
  ctx.stroke()
  ctx.restore()
}

/**
 * One side of the ribbon, as a curve through the points. Each step is a quadratic whose control
 * point is the sample itself and whose end is halfway to the next one, which rounds every corner
 * without the overshoot a Catmull-Rom spline gives on a sharp jump between two notes.
 */
function edge(ctx: CanvasRenderingContext2D, phrase: ContourPoint[], yOf: (point: ContourPoint) => number, reverse: boolean): void {
  const points = reverse ? [...phrase].reverse() : phrase
  ctx.lineTo(points[0].x, yOf(points[0]))
  for (let i = 0; i < points.length - 1; i++) {
    const here = points[i]
    const next = points[i + 1]
    ctx.quadraticCurveTo(here.x, yOf(here), (here.x + next.x) / 2, (yOf(here) + yOf(next)) / 2)
  }
  const last = points[points.length - 1]
  ctx.lineTo(last.x, yOf(last))
}

/** A note change: a filled dot with a softer ring around it, both following the loudness. */
function dot(ctx: CanvasRenderingContext2D, mark: Mark, look: NotesGraphLook): void {
  ctx.save()
  ctx.fillStyle = look.line
  ctx.globalAlpha = mark.opacity * 0.25
  ctx.beginPath()
  ctx.arc(mark.x, mark.y, mark.radius * 1.9, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = mark.opacity
  ctx.beginPath()
  ctx.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
