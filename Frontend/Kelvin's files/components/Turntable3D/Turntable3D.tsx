import { Suspense, useEffect, useRef, useState, type RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { NeutralToneMapping, VSMShadowMap } from 'three'
import StudioLights from './StudioLights'
import CameraRig from './CameraRig'
import TurntableModel, { type TurntableModelProps } from './TurntableModel'

/** Sharper than 1.5× on a retina screen costs a lot of GPU for little to see; a MacBook Air stays smooth. */
const MAX_PIXEL_RATIO = 1.5
/** Renderer options; the stencil buffer is what cuts the HUM button's hole in the plinth (HumKey3D). */
const GL = { antialias: true, alpha: true, stencil: true, toneMapping: NeutralToneMapping }

export interface Turntable3DProps extends Omit<TurntableModelProps, 'onHover'> {
  /** What tapping the record does now, e.g. "Pause the record". */
  label: string
}

/**
 * The turntable in real 3D (three.js through react-three-fiber). Drag to look around it; the wheel
 * always scrolls the page. It draws only while it's on screen. The canvas is hidden from screen
 * readers: the record has a button of its own here, and the gnome has one on the page.
 */
export default function Turntable3D({ label, ...model }: Turntable3DProps) {
  const box = useRef<HTMLDivElement>(null)
  const onScreen = useOnScreen(box)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)

  return (
    <div ref={box} className="tt3d" style={{ cursor: model.gnome.holding || hovering ? 'pointer' : dragging ? 'grabbing' : 'grab' }}>
      <Canvas
        shadows={{ type: VSMShadowMap }}
        dpr={[1, MAX_PIXEL_RATIO]}
        frameloop={onScreen ? 'always' : 'never'}
        camera={{ fov: 30, near: 0.05, far: 10 }}
        gl={GL}
        style={{ touchAction: 'pan-y' }}
        aria-hidden="true"
      >
        <StudioLights />
        <CameraRig onDrag={setDragging} frozen={model.gnome.holding} />
        <Suspense fallback={null}>
          <TurntableModel {...model} onHover={setHovering} />
        </Suspense>
      </Canvas>

      {/* the keyboard's way to the record; it shows while it has focus */}
      <button
        type="button"
        className="glass-surface glass-control sr-only px-5 py-2 text-sm text-ink focus-visible:not-sr-only focus-visible:absolute focus-visible:top-3 focus-visible:left-1/2 focus-visible:-translate-x-1/2"
        aria-label={label}
        aria-disabled={!model.tappable}
        onClick={model.tappable ? model.onTap : undefined}
      >
        <span className="glass-content">{label}</span>
      </button>
    </div>
  )
}

/** Whether the element is (at least partly) on screen; the scene stops drawing while it isn't. */
function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return onScreen
}
