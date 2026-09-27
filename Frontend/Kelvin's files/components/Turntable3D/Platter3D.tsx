import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Color, MeshPhysicalMaterial, type Group } from 'three'
import type { MotionValue } from 'motion/react'
import { readNumberToken, readToken } from '../../design/readToken'
import { MAT, PLATTER, RECORD, SPINDLE, TOP, VINYL } from './dimensions'
import { lathe, turned } from './lathe'
import type { TurntableMaterials } from './materials'
import { recordSurfaceMaps, useDiscTexture, useDisposable, type DiscState } from './textures'
import { DRAG_PIXELS } from './CameraRig'

const DEGREES = Math.PI / 180
/** How quickly the glass turns into vinyl (per second) once it's pressed. */
const PRESS_FADE = 1.6
/** The printed face is mapped a hair larger than the record, so its drawn edge never shows as a seam. */
const FACE_SCALE = 1.006
/**
 * The glass disc's polished edge: how much of it shows over what's behind it, and how far it reaches
 * onto the top (where a real disc's edge looks lighter, and where refraction would otherwise smear
 * in the bright platter rim just behind it).
 */
const EDGE_OPACITY = 0.8
const EDGE_BAND = 0.0025
const HOLE = VINYL.hole * RECORD.radius
const H = RECORD.height

export interface PlatterProps {
  /** Platter angle in degrees from useTurntable (it already runs at 33⅓ rpm, spins up and down). */
  rotation: MotionValue<number>
  disc: DiscState
  isVinyl: boolean
  tappable: boolean
  onTap: () => void
  onHover: (over: boolean) => void
  reducedMotion: boolean
  materials: TurntableMaterials
}

/**
 * What turns: the machined-aluminum platter on its hub, the felt mat, the record and the chrome
 * spindle. The record is a thick glass disc (it refracts the mat, its edge glows faintly green)
 * until the hum is pressed into it; then it's vinyl: near-black and glossy, a slightly raised rim,
 * the lead-in, grooves whose reflections stretch into the fixed radial streaks of a real record
 * (they're round, so the streaks stay put while it turns), the smooth run-out, and a matte paper
 * label. Its face is the same drawing as the flat disc (useDiscTexture), liquid and all.
 */
export default function Platter3D({ rotation, disc, isVinyl, tappable, onTap, onHover, reducedMotion, materials }: PlatterProps) {
  const { gl } = useThree()
  const face = useDiscTexture(disc, gl.capabilities.getMaxAnisotropy())
  const labelRatio = useMemo(() => readNumberToken('--vinyl-label-size') / 100, [])
  const maps = useDisposable(() => recordSurfaceMaps(labelRatio))
  const shapes = useMemo(() => recordShapes(labelRatio * RECORD.radius), [labelRatio])

  const looks = useMemo(() => {
    // glass mirrors the studio's lights crisply and brightly; that, and its edge, is what reads as glass
    const glass = { envMap: materials.studio, envMapIntensity: 2.2, transmission: 1, ior: 1.52, metalness: 0, transparent: true, specularIntensity: 1 }
    return {
      // the printed face: liquid while recording, vinyl once pressed
      face: new MeshPhysicalMaterial({
        envMap: materials.studio,
        map: face,
        transparent: true,
        roughness: 1,
        roughnessMap: maps.roughness,
        anisotropy: 0.9,
        anisotropyMap: maps.anisotropy,
        specularIntensity: 1,
      }),
      edge: new MeshPhysicalMaterial({ envMap: materials.studio, color: readToken('--color-vinyl'), roughness: 0.22, transparent: true, opacity: 0 }),
      glass: new MeshPhysicalMaterial({ ...glass, roughness: 0.03, thickness: 0.0015, attenuationColor: new Color('#e6f2eb'), attenuationDistance: 0.12 }),
      // the polished edge: it doesn't refract (seen edge-on, what it would bend toward is past the
      // turntable, and three.js fills that in white), it glows the faint green of thick glass
      glassEdge: new MeshPhysicalMaterial({ envMap: materials.studio, envMapIntensity: 1.6, color: '#bcd9ca', roughness: 0.08, transparent: true, opacity: EDGE_OPACITY }),
    }
  }, [materials.studio, face, maps])
  useEffect(
    () => () => {
      for (const geometry of Object.values(shapes)) geometry.dispose()
      for (const material of Object.values(looks)) material.dispose()
    },
    [shapes, looks],
  )

  // the platter turns with useTurntable's angle (clockwise seen from above); the glass becomes vinyl
  const spin = useRef<Group>(null)
  const glassDisc = useRef<Group>(null)
  const vinyl = useRef(isVinyl ? 1 : 0)
  useFrame((_, seconds) => {
    if (spin.current) spin.current.rotation.y = -rotation.get() * DEGREES
    const target = isVinyl ? 1 : 0
    vinyl.current = reducedMotion ? target : vinyl.current + (target - vinyl.current) * (1 - Math.exp(-Math.min(seconds, 0.1) * PRESS_FADE))
    const p = vinyl.current
    looks.face.roughness = 0.16 + 0.84 * p // the liquid is glossy all over; vinyl follows its map
    looks.face.anisotropy = 0.02 + 0.93 * p // never quite 0, so the shader never has to change
    looks.edge.opacity = p
    looks.glass.opacity = 1 - p
    looks.glassEdge.opacity = EDGE_OPACITY * (1 - p)
    if (glassDisc.current) glassDisc.current.visible = p < 0.995 // no glass, no refraction pass
  })

  const tap = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > DRAG_PIXELS || !tappable) return // the end of a drag, or nothing to pause yet
    onTap()
  }
  const platterTop = PLATTER.lift + PLATTER.height

  return (
    <group ref={spin} position={[PLATTER.x, TOP, PLATTER.z]}>
      <mesh geometry={shapes.hub} material={materials.anodized} />
      <mesh geometry={shapes.platter} material={[materials.turned, materials.anodized]} position-y={PLATTER.lift} castShadow receiveShadow />
      <mesh geometry={shapes.spindle} material={materials.chrome} position-y={platterTop} castShadow />
      <group
        position-y={platterTop}
        onClick={tap}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(tappable)
        }}
        onPointerOut={() => onHover(false)}
      >
        <mesh geometry={shapes.mat} material={materials.felt} receiveShadow />
        <group position-y={MAT.height}>
          <mesh geometry={shapes.record} material={[looks.face, looks.edge]} receiveShadow />
          <group ref={glassDisc}>
            <mesh geometry={shapes.glass} material={[looks.glass, looks.glassEdge]} />
          </group>
        </group>
      </group>
    </group>
  )
}

/** The turning parts' shapes, each from the part's bottom (the group places them). */
function recordShapes(labelRadius: number) {
  const R = RECORD.radius
  const top = H + VINYL.label // the label area is a hair thicker; the grooved area sits at RECORD_TOP
  const face = { radialV: R * FACE_SCALE, planar: R * FACE_SCALE, segments: 160, filletSteps: 3 }
  return {
    hub: turned([[0, 0], [0.05, 0], [0.05, PLATTER.lift], [0, PLATTER.lift]], { segments: 48 }),
    // machined aluminum: a bevel underneath, a crisp top edge, a fine groove ring just outside the mat
    platter: lathe(
      [
        { points: [[0.03, 0]], material: 1 },
        { points: [[0.1492, 0, 0.0006], [PLATTER.radius, 0.0052, 0.0008], [PLATTER.radius, PLATTER.height, 0.0004], [0.1542, PLATTER.height], [0.1539, PLATTER.height - 0.0003], [0.1536, PLATTER.height], [0.03, PLATTER.height]] },
      ],
      { segments: 128, filletSteps: 3 },
    ),
    mat: turned([[0.0045, 0], [MAT.radius, 0], [MAT.radius, MAT.height, 0.0009], [0.0045, MAT.height]], { segments: 128, planar: MAT.radius }),
    spindle: turned(
      [[0, 0], [SPINDLE.radius, 0], [SPINDLE.radius, RECORD.height + MAT.height + SPINDLE.height - 0.0028, 0.0004], [SPINDLE.radius * 0.72, RECORD.height + MAT.height + SPINDLE.height - 0.0004, 0.0009], [0, RECORD.height + MAT.height + SPINDLE.height]],
      { segments: 40 },
    ),
    // vinyl: the body (bottom, edge, spindle hole) and the printed face with its rim, lead-in and label step
    record: lathe(
      [
        { points: [[HOLE, 0], [R, 0, 0.0005]], material: 1 },
        {
          points: [
            [R, H - 0.0006, 0.0006],
            [R - 0.0029, H + VINYL.rim, 0.0006],
            [R * VINYL.lip, H, 0.0008],
            [labelRadius + 0.0006, H, 0.0003],
            [labelRadius - 0.0002, top, 0.0003],
            [HOLE + 0.0004, top, 0.0003],
          ],
        },
        { points: [[HOLE, top - 0.0004], [HOLE, 0]], material: 1 },
      ],
      face,
    ),
    // the glass disc: flat and polished, its rounded edge and the band just inside it in their own material
    glass: lathe(
      [
        { points: [[HOLE, 0]] },
        { points: [[R, 0, 0.0007], [R, H - 0.0001, 0.0007]], material: 1 },
        { points: [[R - EDGE_BAND, H - 0.0001], [HOLE, H - 0.0001, 0.0003], [HOLE, 0]] },
      ],
      face,
    ),
  }
}
