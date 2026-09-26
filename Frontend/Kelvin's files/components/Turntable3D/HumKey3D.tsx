import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { readToken } from '../../design/readToken'
import { KEY, KEY_Y, LED_Y, PLINTH } from './dimensions'
import { keyLabelTexture } from './textures'

const FRONT = PLINTH.depth / 2
/** How quickly the key moves in or out (per second). */
const PRESS = 14

/**
 * HUM as a push button on the front of the plinth, where a turntable's speed buttons sit. It's
 * pressed in and its amber LED is lit while the mic records a hum. It's only a light: the mic
 * itself is held to hum, and the gnome is held to talk.
 */
export default function HumKey3D({ humming }: { humming: boolean }) {
  const { gl } = useThree()
  const face = useMemo(() => keyLabelTexture('HUM', gl.capabilities.getMaxAnisotropy()), [gl])
  useEffect(() => () => face.dispose(), [face])
  const colors = useMemo(() => ({ key: readToken('--color-key'), amber: readToken('--color-amber'), off: readToken('--color-led-off') }), [])
  const shape = useMemo(() => new RoundedBoxGeometry(KEY.width, KEY.height, KEY.depth, 3, 0.0025), [])
  useEffect(() => () => shape.dispose(), [shape])
  const cap = useRef<Mesh>(null)

  // pressed in while humming: the cap's front sinks from 6 mm proud of the plinth to 2 mm
  useFrame((_, seconds) => {
    if (!cap.current) return
    const target = FRONT - (humming ? KEY.travel : 0)
    cap.current.position.z += (target - cap.current.position.z) * (1 - Math.exp(-seconds * PRESS))
  })

  return (
    <group position-x={KEY.left + KEY.width / 2}>
      <mesh ref={cap} geometry={shape} position={[0, KEY_Y, FRONT]} castShadow>
        {[0, 1, 2, 3, 5].map((side) => (
          <meshStandardMaterial key={side} attach={`material-${side}`} color={colors.key} roughness={0.45} />
        ))}
        <meshStandardMaterial attach="material-4" map={face} roughness={0.45} />
      </mesh>
      <mesh position={[0, LED_Y, FRONT + 0.0006]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.0034, 0.0034, 0.0022, 24]} />
        <meshStandardMaterial
          color={humming ? colors.amber : colors.off}
          emissive={humming ? colors.amber : '#000000'}
          emissiveIntensity={humming ? 2.4 : 0}
          roughness={0.3}
        />
      </mesh>
    </group>
  )
}
