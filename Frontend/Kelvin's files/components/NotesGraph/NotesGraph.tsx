import { useEffect, useMemo, useRef } from 'react'
import type { SongNotes } from '../../api/talk'
import { melodyShapes, type Bounds } from '../../drawing/melodyContour'
import { drawNotesGraph } from '../../drawing/drawNotesGraph'
import { readNotesGraphLook } from '../../design/readToken'
import { useElementSize } from '../../hooks/useElementSize'

/** Sharper than 3× costs a lot of drawing for no visible gain (same as the disc). */
const MAX_PIXEL_RATIO = 3
/** The drawing's shape; the canvas stretches to the panel and keeps this ratio. */
const ASPECT = 640 / 240
const PADDING: Bounds['padding'] = { left: 10, right: 10, top: 18, bottom: 18 }

/**
 * The tune as a picture: the hum's own pitch, moment by moment, as a glowing line whose thickness
 * follows how loud it was, with a dot wherever the melody moves to a new note. The notes the
 * finished song plays sit under it as flat bars, so moving the pitch or speed faders shows as the
 * song stepping away from the hum.
 *
 * Deliberately unlabelled — no note names, no numbers — and drawn on a canvas at the screen's own
 * pixel density, so it stays crisp on a retina display.
 */
export default function NotesGraph({ notes }: { notes: SongNotes }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useElementSize(canvasRef)
  const look = useMemo(readNotesGraphLook, [])
  const width = size?.width ?? 0
  const height = width / ASPECT

  const shapes = useMemo(
    () => (width > 0 ? melodyShapes(notes, { width, height, padding: PADDING }) : null),
    [notes, width, height],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !shapes || width === 0) return

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    const [backingWidth, backingHeight] = [Math.round(width * pixelRatio), Math.round(height * pixelRatio)]
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth
      canvas.height = backingHeight
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    drawNotesGraph(context, shapes, look, width, height)
  }, [shapes, look, width, height])

  if (notes.sung.length === 0 && notes.played.length === 0) return null

  return (
    <figure className="glass-surface glass-panel w-full max-w-2xl px-6 py-5">
      <div className="glass-content">
        <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
          <span className="font-semibold tracking-widest uppercase">Your tune</span>
          <span>{shapes?.moved ? 'amber: as you hummed it · grey: what the song plays' : 'as you hummed it'}</span>
        </figcaption>
        <canvas
          ref={canvasRef}
          className="mt-3 block w-full"
          style={{ aspectRatio: ASPECT }}
          role="img"
          aria-label={description(notes)}
        />
      </div>
    </figure>
  )
}

/** For screen readers: the shape of the tune in words, with no note names to read out. */
function description({ sung }: SongNotes): string {
  if (sung.length === 0) return 'The tune you hummed.'
  const last = sung[sung.length - 1]
  const seconds = last.start + last.duration - sung[0].start
  let rises = 0
  let falls = 0
  for (let i = 1; i < sung.length; i++) {
    const step = sung[i].midi - sung[i - 1].midi
    if (step > 0.5) rises++
    else if (step < -0.5) falls++
  }
  return `The tune you hummed: ${sung.length} notes over ${seconds.toFixed(1)} seconds, rising ${rises} times and falling ${falls} times.`
}
