import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { Color, SRGBColorSpace, TextureLoader, type Group, type MeshPhysicalMaterial, type MeshStandardMaterial, type Texture } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { MotionValue } from 'motion/react'
import woodPhoto from '../../assets/textures/MapleWood.avif'
import { readToken } from '../../design/readToken'
import type { Mode } from '../../hooks/useMode'
import { FOOT, MAT, PLATTER, PLINTH, RECORD, RECORD_TOP, TOP } from './dimensions'
import { brushedMetalTexture, softShadowTexture, useDiscTexture, type DiscState } from './textures'
import Tonearm3D from './Tonearm3D'
import ModeKeys3D from './ModeKeys3D'
import { DRAG_PIXELS } from './CameraRig'

const DEGREES = Math.PI / 180
/** How quickly the glass fades into vinyl (per second), and how much of the glass shows over the mat. */
const PRESS_FADE = 1.6
const GLASS_OPACITY = 0.26

export interface TurntableModelProps {
  /** Platter angle in degrees from useTurntable (it already runs at 33⅓ rpm, spins up and down). */
  rotation: MotionValue<number>
  disc: DiscState
  /** The glass has been pressed into vinyl. */
  isVinyl: boolean
  /** Tapping the record pauses and resumes it while it plays. */
  tappable: boolean
  onTap: () => void
  onRecord: boolean
  reducedMotion: boolean
  mode: Mode
  onModeChange: (mode: Mode) => void
  modeLocked: boolean
  /** Reports whether the pointer is over something that can be clicked (for the hand cursor). */
  onHover: (over: boolean) => void
  /** The studio's reflections; the record takes less of them than the metal, so it stays black. */
  environment: Texture | null
}

/**
 * The turntable: a thick walnut plinth on four feet, a brushed-aluminum platter with a black rubber
 * mat and the record, the tonearm, and the HUM / TALK keys on the front.
 */
export default function TurntableModel(props: TurntableModelProps) {
  const { rotation, disc, isVinyl, tappable, onTap, onRecord, reducedMotion, onHover, environment } = props
  const { gl } = useThree()
  const anisotropy = gl.capabilities.getMaxAnisotropy()
  const wood = useLoader(TextureLoader, woodPhoto)
  const plinth = useMemo(() => new RoundedBoxGeometry(PLINTH.width, PLINTH.height, PLINTH.depth, 5, PLINTH.radius), [])
  const brushed = useMemo(brushedMetalTexture, [])
  const underShadow = useMemo(softShadowTexture, [])
  const face = useDiscTexture(disc, anisotropy)
  const colors = useMemo(
    () => ({
      walnut: readToken('--wood-shade-3d'),
      vinyl: readToken('--color-vinyl'),
      mat: readToken('--color-mat'),
      metal: readToken('--metal-light'),
      metalDark: readToken('--metal-dark'),
    }),
    [],
  )
  useEffect(() => {
    wood.colorSpace = SRGBColorSpace
    wood.anisotropy = anisotropy
    brushed.repeat.set(8, 1)
    brushed.anisotropy = anisotropy
  }, [wood, brushed, anisotropy])
  useEffect(() => () => {
    plinth.dispose()
    brushed.dispose()
    underShadow.dispose()
  }, [plinth, brushed, underShadow])

  // the platter turns with useTurntable's angle (clockwise seen from above); the glass fades into vinyl
  const spin = useRef<Group>(null)
  const glass = useRef<MeshPhysicalMaterial>(null)
  const edge = useRef<MeshStandardMaterial>(null)
  const vinyl = useRef(isVinyl ? 1 : 0)
  const edgeColors = useMemo(() => ({ glass: new Color('#ffffff'), vinyl: new Color(colors.vinyl) }), [colors])
  useFrame((_, seconds) => {
    if (spin.current) spin.current.rotation.y = -rotation.get() * DEGREES
    const target = isVinyl ? 1 : 0
    vinyl.current = reducedMotion ? target : vinyl.current + (target - vinyl.current) * (1 - Math.exp(-seconds * PRESS_FADE))
    if (glass.current) glass.current.opacity = GLASS_OPACITY * (1 - vinyl.current)
    if (edge.current) {
      edge.current.opacity = 0.35 + 0.65 * vinyl.current
      edge.current.color.copy(edgeColors.glass).lerp(edgeColors.vinyl, vinyl.current)
    }
  })

  const tap = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > DRAG_PIXELS || !tappable) return // the end of a drag, or nothing to pause yet
    onTap()
  }
  const platterY = PLATTER.lift + PLATTER.height / 2
  const recordY = RECORD_TOP - TOP

  return (
    <group>
      {/* a soft shadow right under the plinth, as in a product photo */}
      <mesh position={[0.012, 0.0005, 0.02]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[PLINTH.width * 2, PLINTH.depth * 2]} />
        <meshBasicMaterial map={underShadow} transparent depthWrite={false} color="#000000" opacity={0.3} />
      </mesh>

      {/* the plinth on its feet */}
      <mesh geometry={plinth} position-y={FOOT.height + PLINTH.height / 2} castShadow receiveShadow>
        <meshStandardMaterial map={wood} color={colors.walnut} roughness={0.72} />
      </mesh>
      {[-1, 1].flatMap((sideX) =>
        [-1, 1].map((sideZ) => (
          <mesh
            key={`${sideX}${sideZ}`}
            position={[sideX * (PLINTH.width / 2 - FOOT.inset), FOOT.height / 2, sideZ * (PLINTH.depth / 2 - FOOT.inset)]}
            castShadow
          >
            <cylinderGeometry args={[FOOT.radius, FOOT.radius * 1.1, FOOT.height, 32]} />
            <meshStandardMaterial color="#2a2623" roughness={0.8} />
          </mesh>
        )),
      )}

      {/* the platter, the mat and the record, turning together */}
      <group ref={spin} position={[PLATTER.x, TOP, PLATTER.z]}>
        <mesh position-y={PLATTER.lift / 2}>
          <cylinderGeometry args={[0.06, 0.06, PLATTER.lift, 32]} />
          <meshStandardMaterial color="#161514" roughness={0.7} />
        </mesh>
        <mesh position-y={platterY} castShadow receiveShadow>
          <cylinderGeometry args={[PLATTER.radius, PLATTER.radius, PLATTER.height, 128]} />
          <meshStandardMaterial attach="material-0" color={colors.metal} metalness={1} roughness={0.2} roughnessMap={brushed} />
          <meshStandardMaterial attach="material-1" color={colors.metal} metalness={1} roughness={0.14} />
          <meshStandardMaterial attach="material-2" color={colors.metalDark} metalness={1} roughness={0.5} />
        </mesh>
        <group
          onClick={tap}
          onPointerOver={(event) => {
            event.stopPropagation()
            onHover(tappable)
          }}
          onPointerOut={() => onHover(false)}
        >
          <mesh position-y={PLATTER.lift + PLATTER.height + MAT.height / 2} receiveShadow>
            <cylinderGeometry args={[MAT.radius, MAT.radius, MAT.height, 128]} />
            <meshStandardMaterial color={colors.mat} roughness={0.95} />
          </mesh>
          <mesh position-y={recordY - RECORD.height / 2}>
            <cylinderGeometry args={[RECORD.radius, RECORD.radius, RECORD.height, 128, 1, true]} />
            <meshStandardMaterial ref={edge} transparent roughness={0.3} />
          </mesh>
          {/* the record's face: the same drawing as the flat disc, glossy like vinyl */}
          <mesh position-y={recordY + 0.00005} rotation-x={-Math.PI / 2} receiveShadow>
            <circleGeometry args={[RECORD.radius, 128]} />
            <meshPhysicalMaterial map={face} transparent roughness={0.4} envMap={environment} envMapIntensity={0.35} clearcoat={0.7} clearcoatRoughness={0.05} />
          </mesh>
          {/* while it's still glass: a clear, shiny lens over the mat, fading away once pressed */}
          <mesh position-y={recordY + 0.0006} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[RECORD.radius, 128]} />
            <meshPhysicalMaterial ref={glass} transparent opacity={GLASS_OPACITY} depthWrite={false} roughness={0.04} clearcoat={1} envMap={environment} envMapIntensity={2.2} />
          </mesh>
        </group>
        <mesh position-y={recordY + 0.006}>
          <cylinderGeometry args={[0.0036, 0.0036, 0.013, 20]} />
          <meshStandardMaterial color={colors.metal} metalness={1} roughness={0.15} />
        </mesh>
      </group>

      <Tonearm3D onRecord={onRecord} reducedMotion={reducedMotion} />
      <ModeKeys3D mode={props.mode} onChange={props.onModeChange} locked={props.modeLocked} onHover={onHover} />
    </group>
  )
}
