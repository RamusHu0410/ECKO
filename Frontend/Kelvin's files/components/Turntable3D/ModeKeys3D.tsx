import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import type { Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Mode } from '../../hooks/useMode'
import { readToken } from '../../design/readToken'
import { KEY, KEY_Y, LED_Y, PLINTH } from './dimensions'
import { keyLabelTexture } from './textures'
import { DRAG_PIXELS } from './CameraRig'

const KEYS: { mode: Mode; label: string }[] = [
  { mode: 'hum', label: 'HUM' },
  { mode: 'talk', label: 'TALK' },
]
const FRONT = PLINTH.depth / 2
/** How quickly a key moves in or out (per second). */
const PRESS = 14

interface ModeKeys3DProps {
  mode: Mode
  onChange: (mode: Mode) => void
  /** While the mic is live the keys can't change. */
  locked: boolean
  /** Reports whether the pointer is over a key that can be pressed (for the hand cursor). */
  onHover: (over: boolean) => void
}

/**
 * HUM and TALK as push buttons on the front of the plinth, where a turntable's speed buttons sit:
 * the active one is pressed in and its amber LED is lit. They drive the same mode as the page's
 * HUM / TALK radio buttons, which stay in the page for the keyboard and screen readers.
 */
export default function ModeKeys3D({ mode, onChange, locked, onHover }: ModeKeys3DProps) {
  return (
    <>
      {KEYS.map((key, index) => (
        <Key
          key={key.mode}
          label={key.label}
          x={KEY.left + KEY.width / 2 + index * (KEY.width + KEY.gap)}
          active={mode === key.mode}
          locked={locked}
          onPress={() => onChange(key.mode)}
          onHover={onHover}
        />
      ))}
    </>
  )
}

interface KeyProps {
  label: string
  x: number
  active: boolean
  locked: boolean
  onPress: () => void
  onHover: (over: boolean) => void
}

function Key({ label, x, active, locked, onPress, onHover }: KeyProps) {
  const { gl } = useThree()
  const face = useMemo(() => keyLabelTexture(label, gl.capabilities.getMaxAnisotropy()), [label, gl])
  useEffect(() => () => face.dispose(), [face])
  const colors = useMemo(() => ({ key: readToken('--color-key'), amber: readToken('--color-amber'), off: readToken('--color-led-off') }), [])
  const shape = useMemo(() => new RoundedBoxGeometry(KEY.width, KEY.height, KEY.depth, 3, 0.0025), [])
  useEffect(() => () => shape.dispose(), [shape])
  const cap = useRef<Mesh>(null)

  // pressed in while active: the cap's front sinks from 6 mm proud of the plinth to 2 mm
  useFrame((_, seconds) => {
    if (!cap.current) return
    const target = FRONT - (active ? KEY.travel : 0)
    cap.current.position.z += (target - cap.current.position.z) * (1 - Math.exp(-seconds * PRESS))
  })

  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > DRAG_PIXELS || locked) return // the end of a drag, or the mic is live
    onPress()
  }
  const tint = locked ? '#d2ccc3' : '#ffffff'

  return (
    <group position-x={x}>
      <mesh
        ref={cap}
        geometry={shape}
        position={[0, KEY_Y, FRONT]}
        castShadow
        onClick={click}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(!locked)
        }}
        onPointerOut={() => onHover(false)}
      >
        {[0, 1, 2, 3, 5].map((side) => (
          <meshStandardMaterial key={side} attach={`material-${side}`} color={colors.key} roughness={0.45} />
        ))}
        <meshStandardMaterial attach="material-4" map={face} color={tint} roughness={0.45} />
      </mesh>
      <mesh position={[0, LED_Y, FRONT + 0.0006]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.0034, 0.0034, 0.0022, 24]} />
        <meshStandardMaterial
          color={active ? colors.amber : colors.off}
          emissive={active ? colors.amber : '#000000'}
          emissiveIntensity={active ? 2.4 : 0}
          roughness={0.3}
        />
      </mesh>
    </group>
  )
}
