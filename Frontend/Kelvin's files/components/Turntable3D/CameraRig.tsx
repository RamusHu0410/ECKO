import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

/** Where the camera starts: a little to the right of the front, looking down at an elevated three-quarter view. */
const DEFAULT_VIEW = { turn: 0.5, tilt: 0.93 }
const TARGET = new Vector3(0.02, 0.028, 0.05)
const DISTANCE = 1.02
/** From nearly overhead to just above the table's edge: never under it. */
const TILT_RANGE = [0.22, 1.3] as const
const RADIANS_PER_PIXEL = 0.006
/** A pointer that moves further than this between press and release was dragging the view, not clicking. */
export const DRAG_PIXELS = 5
/** How quickly the camera catches up with the drag (per second); higher is snappier. */
const DAMPING = 9

/**
 * Orbits the camera around the turntable: hold the left mouse button and move to turn it, double-click
 * to go back to the starting view. It never listens to the wheel, so scrolling always moves the page;
 * there is no zoom and no panning. `onDrag` says when a drag starts and ends (for the cursor). While
 * `frozen` (the gnome is being held) moving the pointer doesn't turn it.
 */
export default function CameraRig({ onDrag, frozen = false }: { onDrag: (dragging: boolean) => void; frozen?: boolean }) {
  const { camera, gl } = useThree()
  const wanted = useRef({ ...DEFAULT_VIEW }) // where the drag has asked the camera to go
  const shown = useRef({ ...DEFAULT_VIEW }) // where it is now, easing toward `wanted`
  const latestOnDrag = useRef(onDrag)
  const latestFrozen = useRef(frozen)
  useEffect(() => {
    latestOnDrag.current = onDrag
    latestFrozen.current = frozen
  })

  useEffect(() => {
    const canvas = gl.domElement
    let last: { x: number; y: number } | null = null

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      last = { x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
      latestOnDrag.current(true)
    }
    const move = (event: PointerEvent) => {
      if (!last) return
      if (latestFrozen.current) {
        last = { x: event.clientX, y: event.clientY }
        return
      }
      const view = wanted.current
      view.turn -= (event.clientX - last.x) * RADIANS_PER_PIXEL
      view.tilt = Math.min(TILT_RANGE[1], Math.max(TILT_RANGE[0], view.tilt - (event.clientY - last.y) * RADIANS_PER_PIXEL))
      last = { x: event.clientX, y: event.clientY }
    }
    const up = () => {
      if (!last) return
      last = null
      latestOnDrag.current(false)
    }
    const reset = () => {
      wanted.current = { ...DEFAULT_VIEW }
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('dblclick', reset)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('dblclick', reset)
    }
  }, [gl])

  useFrame((_, seconds) => {
    const ease = 1 - Math.exp(-seconds * DAMPING)
    const view = shown.current
    view.turn += (wanted.current.turn - view.turn) * ease
    view.tilt += (wanted.current.tilt - view.tilt) * ease
    camera.position.set(
      TARGET.x + DISTANCE * Math.sin(view.tilt) * Math.sin(view.turn),
      TARGET.y + DISTANCE * Math.cos(view.tilt),
      TARGET.z + DISTANCE * Math.sin(view.tilt) * Math.cos(view.turn),
    )
    camera.lookAt(TARGET)
  })

  return null
}
