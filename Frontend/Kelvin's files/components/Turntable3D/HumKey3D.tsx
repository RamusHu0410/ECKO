import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  AlwaysStencilFunc,
  Color,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ReplaceStencilOp,
  Shape,
  ShapeGeometry,
  type Group,
} from 'three'
import { readToken } from '../../design/readToken'
import { CONTROL_Y, FRONT, KEY } from './dimensions'
import { turned } from './lathe'
import { HOLE_STENCIL, type TurntableMaterials } from './materials'
import { letteringTexture, softDiscTexture, useDisposable } from './textures'

/** How quickly the button moves in or out, and the LED fades (per second). */
const PRESS = 14
/** The gap around the cap, the metal bezel lining the hole, and how deep the hole goes. */
const GAP = 0.0007
const BEZEL = 0.0009
const HOLE_DEPTH = 0.011
const BEVEL = 0.0005

/**
 * HUM, a push button set into the front of the plinth where a turntable's start button sits: a
 * brushed-aluminum cap engraved HUM, in a hole lined with a thin metal bezel, with a small amber
 * LED beside it. While the mic records a hum the button is pressed in and the LED glows. It's
 * only a light: the mic itself is held to hum, and the gnome is held to talk.
 */
export default function HumKey3D({ humming, materials }: { humming: boolean; materials: TurntableMaterials }) {
  const { gl } = useThree()
  const anisotropy = gl.capabilities.getMaxAnisotropy()
  const colors = useMemo(() => ({ amber: readToken('--color-amber'), off: readToken('--color-led-off'), font: readToken('--font-sans') }), [])
  const maps = useDisposable(() => ({
    label: letteringTexture([{ text: 'HUM', x: 0.5, y: 0.53, size: 0.62, weight: 700 }], 0.03, 0.009, colors.font, anisotropy),
    glow: softDiscTexture(0),
  }))

  const shapes = useMemo(() => {
    const hole = stadium(KEY.width, KEY.height)
    const bezel = stadium(KEY.width + 2 * BEZEL, KEY.height + 2 * BEZEL)
    bezel.holes.push(stadium(KEY.width, KEY.height))
    const capDepth = KEY.depth - 2 * BEVEL
    return {
      mask: new ShapeGeometry(hole, 24),
      floor: new ShapeGeometry(hole, 24),
      sleeve: new ExtrudeGeometry(bezel, { depth: HOLE_DEPTH, bevelEnabled: false, curveSegments: 24 }),
      cap: new ExtrudeGeometry(stadium(KEY.width - 2 * (GAP + BEVEL), KEY.height - 2 * (GAP + BEVEL)), {
        depth: capDepth,
        bevelEnabled: true,
        bevelThickness: BEVEL,
        bevelSize: BEVEL,
        bevelSegments: 3,
        curveSegments: 24,
      }),
      capFront: capDepth + BEVEL,
      led: turned([[0, 0], [0.0026, 0, 0.0002], [0.0026, 0.0006, 0.0003], [0.0018, 0.0009], [0.0017, 0.0012, 0.0006], [0, 0.0019]], { segments: 32 }),
    }
  }, [])
  const looks = useMemo(
    () => ({
      // drawn first: marks the hole, so the plinth's front leaves those pixels to the recess
      mask: new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: HOLE_STENCIL,
        stencilFunc: AlwaysStencilFunc,
        stencilZPass: ReplaceStencilOp,
      }),
      ink: new MeshStandardMaterial({ envMap: materials.studio, color: '#141312', roughness: 0.55, alphaMap: maps.label, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      lens: new MeshStandardMaterial({ envMap: materials.studio, color: colors.off, emissive: colors.amber, emissiveIntensity: 0, roughness: 0.12 }),
      glow: new MeshBasicMaterial({ color: colors.amber, alphaMap: maps.glow, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
      on: new Color(colors.amber),
      off: new Color(colors.off),
    }),
    [materials.studio, maps, colors],
  )
  useEffect(
    () => () => {
      for (const geometry of [shapes.mask, shapes.floor, shapes.sleeve, shapes.cap, shapes.led]) geometry.dispose()
      for (const material of [looks.mask, looks.ink, looks.lens, looks.glow]) material.dispose()
    },
    [shapes, looks],
  )

  // pressed in while humming: the cap's face goes from just proud of the plinth to inside the hole
  const cap = useRef<Group>(null)
  const lit = useRef(0)
  useFrame((_, seconds) => {
    const ease = 1 - Math.exp(-seconds * PRESS)
    if (cap.current) {
      const target = FRONT + KEY.proud - (humming ? KEY.travel : 0)
      cap.current.position.z += (target - cap.current.position.z) * ease
    }
    lit.current += ((humming ? 1 : 0) - lit.current) * ease
    looks.lens.emissiveIntensity = lit.current * 4.5
    looks.lens.color.copy(looks.off).lerp(looks.on, lit.current)
    looks.glow.opacity = lit.current * 0.8
  })

  const ledX = KEY.x + KEY.width / 2 + KEY.ledGap
  return (
    <group>
      <group position={[KEY.x, CONTROL_Y, 0]}>
        <mesh geometry={shapes.mask} material={looks.mask} position-z={FRONT + 0.00002} renderOrder={-10} />
        <mesh geometry={shapes.sleeve} material={[materials.satin, materials.recess]} position-z={FRONT + 0.0003 - HOLE_DEPTH} />
        <mesh geometry={shapes.floor} material={materials.recess} position-z={FRONT + 0.0003 - HOLE_DEPTH} />
        <group ref={cap} position-z={FRONT + KEY.proud}>
          <mesh geometry={shapes.cap} material={[materials.brushed, materials.satin]} position-z={-shapes.capFront} />
          <mesh material={looks.ink} position-z={0.00004}>
            <planeGeometry args={[0.03, 0.009]} />
          </mesh>
        </group>
      </group>
      <group position={[ledX, CONTROL_Y, FRONT]}>
        <mesh geometry={shapes.led} material={materials.chrome} rotation-x={Math.PI / 2} />
        <mesh position-z={0.0009} material={looks.lens}>
          <sphereGeometry args={[0.0015, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position-z={0.0012} material={looks.glow} renderOrder={2}>
          <planeGeometry args={[0.016, 0.016]} />
        </mesh>
      </group>
    </group>
  )
}

/** A stadium (a rectangle with fully rounded ends), centered on the origin. */
function stadium(width: number, height: number): Shape {
  const radius = height / 2
  const reach = width / 2 - radius
  const shape = new Shape()
  shape.moveTo(-reach, -radius)
  shape.lineTo(reach, -radius)
  shape.absarc(reach, 0, radius, -Math.PI / 2, Math.PI / 2, false)
  shape.lineTo(-reach, radius)
  shape.absarc(-reach, 0, radius, Math.PI / 2, (3 * Math.PI) / 2, false)
  return shape
}
