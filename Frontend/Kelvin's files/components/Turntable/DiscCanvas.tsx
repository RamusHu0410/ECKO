import { useEffect, useMemo, useRef } from 'react'
import { drawDiscFill, type DiscFrame, type DiscLook } from '../../drawing/drawDiscFill'
import { useElementSize } from '../../hooks/useElementSize'
import { readNumberToken, readToken } from '../../design/readToken'

/** Sharper than 3× costs a lot of drawing for no visible gain. */
const MAX_PIXEL_RATIO = 3

type DiscCanvasProps = Omit<DiscFrame, 'size' | 'look'>

/** The canvas inside the disc. Sizes itself to the disc and redraws whenever the frame changes. */
export default function DiscCanvas(props: DiscCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useElementSize(canvasRef)
  const look = useMemo(readDiscLook, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !size) return

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    const backingSize = Math.round(size.width * pixelRatio)
    // check both sides: a fresh canvas is 300×150, so a 300px disc would otherwise keep height 150
    if (canvas.width !== backingSize || canvas.height !== backingSize) {
      canvas.width = backingSize
      canvas.height = backingSize
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    drawDiscFill(context, { ...props, size: size.width, look })
  })

  return <canvas ref={canvasRef} className="absolute inset-0 size-full rounded-full" aria-hidden="true" />
}

function readDiscLook(): DiscLook {
  return {
    fontFamily: readToken('--font-sans'),
    labelRatio: readNumberToken('--vinyl-label-size') / 100,
    liquid: readToken('--color-liquid'),
    liquidEdge: readToken('--color-liquid-edge'),
    ripple: readToken('--color-liquid-ripple'),
    glow: readToken('--color-disc-glow'),
    vinyl: readToken('--color-vinyl'),
    vinylLip: readToken('--color-vinyl-lip'),
    groove: readToken('--color-vinyl-groove'),
    trace: readToken('--color-vinyl-trace'),
    label: readToken('--color-amber'),
    labelInk: readToken('--color-label-ink'),
  }
}
