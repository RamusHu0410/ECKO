import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Vector2, type Group, type Mesh, type MeshBasicMaterial, type MeshPhysicalMaterial } from 'three'
import { readToken } from '../../design/readToken'
import type { TalkPhase } from '../../hooks/useTalk'
import { groundAt, SPAWN, wander, type Leg, type Spot } from './gnomeWalk'

/** How quickly he grows in or shrinks away, and turns (per second); higher is snappier. */
const GROW = 7
const TURN = 9
/** He's modelled about 7 cm tall; this makes him big enough to see and catch at the camera's distance. */
const SCALE = 1.5
/** How high a hop goes above the higher of its two surfaces. */
const HOP_HEIGHT = 0.026
/** How long he waves when he first appears, and now and then after a walk. */
const HELLO_SECONDS = 2.8
const WAVE_SECONDS = 1.6

export interface GnomeProps {
  /** There's a song: he's on the turntable. Without one he shrinks away. */
  present: boolean
  /** A hold starts talking now (there's a song, and ECKO isn't busy answering). */
  enabled: boolean
  /** Being held: he stops, turns to you and listens. */
  holding: boolean
  phase: TalkPhase
  onPress: () => void
  onRelease: () => void
  onHover: (over: boolean) => void
  reducedMotion: boolean
}

/**
 * A little glazed-ceramic garden gnome in green, who appears on the turntable once the hum is a
 * song, waving hello. He wanders about on his own, hopping on and off the record; he can't be moved.
 * Press and hold him to talk: he stops, turns to you and listens (his hat glows) until you let go,
 * then thinks, and bobs along while ECKO answers.
 */
export default function Gnome3D({ present, enabled, holding, phase, onPress, onRelease, onHover, reducedMotion }: GnomeProps) {
  const { camera } = useThree()
  const colors = useMemo(
    () => ({
      green: readToken('--gnome-green'),
      deep: readToken('--gnome-green-deep'),
      dark: readToken('--gnome-green-dark'),
      glow: readToken('--gnome-glow'),
      skin: readToken('--gnome-skin'),
      nose: readToken('--gnome-nose'),
      beard: readToken('--gnome-beard'),
      boot: readToken('--gnome-boot'),
      buckle: readToken('--gnome-buckle'),
    }),
    [],
  )
  // his coat: a bell that flares a little at the hem, closed at the neck
  const coat = useMemo(
    () => [
      new Vector2(0, 0.008),
      new Vector2(0.0122, 0.008),
      new Vector2(0.0128, 0.0095),
      new Vector2(0.0116, 0.016),
      new Vector2(0.0092, 0.024),
      new Vector2(0.0066, 0.029),
      new Vector2(0, 0.0302),
    ],
    [],
  )

  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const leftArm = useRef<Group>(null) // his left, on your right as he faces you: the one he waves
  const rightArm = useRef<Group>(null)
  const leftLeg = useRef<Group>(null)
  const rightLeg = useRef<Group>(null)
  const hat = useRef<MeshPhysicalMaterial>(null)
  const ring = useRef<Mesh>(null)
  const ringMaterial = useRef<MeshBasicMaterial>(null)

  // where he is and what he's doing, changed every frame (not React state)
  const walk = useRef({
    at: { ...SPAWN } as Spot,
    y: groundAt(SPAWN),
    heading: 0,
    size: 0,
    legs: [] as Leg[],
    legTime: 0,
    rest: HELLO_SECONDS,
    wave: HELLO_SECONDS,
    step: 0,
    clock: 0,
    hovered: false,
  })

  // let go anywhere on the page, not only over him
  const latest = useRef({ onRelease })
  useEffect(() => {
    latest.current = { onRelease }
  })
  useEffect(() => {
    if (!holding) return
    const up = () => latest.current.onRelease()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [holding])

  useFrame((_, frameSeconds) => {
    const g = walk.current
    const seconds = Math.min(frameSeconds, 0.05) // a hidden tab coming back doesn't teleport him
    g.clock += seconds
    if (!root.current || !body.current) return

    // growing in with a little overshoot, or shrinking away; once gone he'll come back at the start, waving
    g.size = reducedMotion ? (present ? 1 : 0) : g.size + ((present ? 1 : 0) - g.size) * (1 - Math.exp(-seconds * GROW))
    root.current.visible = g.size > 0.01
    if (!present && g.size < 0.01) {
      Object.assign(g, { at: { ...SPAWN }, y: groundAt(SPAWN), legs: [], rest: HELLO_SECONDS, wave: HELLO_SECONDS })
      return
    }

    const busy = holding || phase !== 'idle'
    const toCamera = Math.atan2(camera.position.x - g.at.x, camera.position.z - g.at.z)
    let facing = toCamera
    let walking = false
    let hopping = 0 // 0 on the ground, up to 1 at the top of a hop

    const leg = g.legs[0]
    if (reducedMotion) {
      g.legs = []
    } else if (leg && (leg.kind === 'hop' || !(busy || g.hovered))) {
      // on his way (a hop always lands; a walk stops while he's pointed at or talked to)
      g.legTime += seconds
      const t = Math.min(1, g.legTime / leg.seconds)
      g.at = { x: leg.from.x + (leg.to.x - leg.from.x) * t, z: leg.from.z + (leg.to.z - leg.from.z) * t }
      facing = Math.atan2(leg.to.x - leg.from.x, leg.to.z - leg.from.z)
      if (leg.kind === 'hop') {
        const from = groundAt(leg.from)
        const to = groundAt(leg.to)
        hopping = 4 * t * (1 - t)
        g.y = from + (to - from) * t + HOP_HEIGHT * hopping
      } else {
        walking = true
        g.y = groundAt(g.at)
        g.step += seconds * 13
      }
      if (t >= 1) {
        g.legs.shift()
        g.legTime = 0
        if (g.legs.length === 0) {
          g.rest = 1 + Math.random() * 2.5
          if (Math.random() < 0.35) g.wave = WAVE_SECONDS
        }
      }
    } else if (!busy && !g.hovered) {
      // standing about until it's time to go somewhere else
      g.rest -= seconds
      if (g.rest <= 0) {
        g.legs = wander(g.at) ?? []
        g.legTime = 0
        g.rest = 1
      }
    }
    if (!walking) g.step = 0
    g.wave = Math.max(0, g.wave - seconds)

    // turn the short way round to where he's going, or to you while he stands
    let turn = facing - g.heading
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    g.heading = reducedMotion ? facing : g.heading + turn * (1 - Math.exp(-seconds * TURN))
    root.current.position.set(g.at.x, g.y, g.at.z)
    root.current.rotation.y = g.heading

    // his pose
    const t = g.clock
    const swing = walking ? Math.sin(g.step) : 0
    const still = reducedMotion ? 0 : 1
    const speaking = phase === 'speaking' ? Math.abs(Math.sin(t * 7)) : 0
    const bob = (walking ? Math.abs(Math.cos(g.step)) * 0.0022 : 0) + speaking * 0.003 * still
    const squash = 1 + (hopping > 0 ? 0 : Math.sin(t * 2.2) * 0.012 * still) + (holding ? 0.05 : 0)
    body.current.position.y = bob
    body.current.scale.set(g.size * (2 - squash), g.size * squash, g.size * (2 - squash))
    body.current.rotation.x = walking ? 0.12 : 0 // leaning into the walk

    if (leftLeg.current && rightLeg.current) {
      const tuck = hopping > 0 ? -0.5 : 0
      leftLeg.current.rotation.x = swing * 0.7 + tuck
      rightLeg.current.rotation.x = -swing * 0.7 + tuck
    }
    if (leftArm.current && rightArm.current) {
      const waving = g.wave > 0 && !busy
      if (holding) {
        // a hand cupped behind his ear
        leftArm.current.rotation.set(-0.3, 0, 2.5)
        rightArm.current.rotation.set(0, 0, -0.35)
      } else if (waving) {
        leftArm.current.rotation.set(0, 0, 2.6 + Math.sin(t * 11) * 0.35 * still)
        rightArm.current.rotation.set(0, 0, -0.25)
      } else if (phase === 'speaking') {
        leftArm.current.rotation.set(-0.4 + Math.sin(t * 7) * 0.3 * still, 0, 0.5)
        rightArm.current.rotation.set(-0.4 - Math.sin(t * 7) * 0.3 * still, 0, -0.5)
      } else if (hopping > 0) {
        leftArm.current.rotation.set(0, 0, 1.2)
        rightArm.current.rotation.set(0, 0, -1.2)
      } else {
        leftArm.current.rotation.set(-swing * 0.6, 0, 0.25)
        rightArm.current.rotation.set(swing * 0.6, 0, -0.25)
      }
    }
    if (head.current) {
      // listening: head cocked · thinking: slowly tilting one way and the other
      head.current.rotation.z = holding ? 0.28 : phase === 'thinking' ? Math.sin(t * 2.4) * 0.3 * still : 0
      head.current.rotation.x = phase === 'thinking' ? -0.15 : 0
    }

    // his hat and a ring at his feet glow green while he listens, and pulse while he thinks
    const pulse = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(t * 6)
    const glow = holding || phase === 'listening' ? pulse : phase === 'thinking' || phase === 'remaking' ? 0.35 * pulse : 0
    if (hat.current) hat.current.emissiveIntensity = glow * 1.6
    if (ringMaterial.current) ringMaterial.current.opacity = glow * 0.55
    if (ring.current) ring.current.visible = glow > 0.01
  })

  const press = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !present) return // shrinking away: he can't be caught any more
    event.stopPropagation()
    onPress()
  }
  const glaze = { roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.12 }

  return (
    <group ref={root} visible={false} scale={SCALE}>
      {/* a soft green ring at his feet while he listens */}
      <mesh ref={ring} position-y={0.0006} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.014, 0.024, 48]} />
        <meshBasicMaterial ref={ringMaterial} color={colors.glow} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>

      <group ref={body}>
        {/* legs and boots, swinging from the hip */}
        {[
          { ref: leftLeg, x: 0.0045 },
          { ref: rightLeg, x: -0.0045 },
        ].map(({ ref, x }) => (
          <group key={x} ref={ref} position={[x, 0.011, 0]}>
            <mesh position-y={-0.004} castShadow>
              <cylinderGeometry args={[0.0027, 0.0027, 0.008, 16]} />
              <meshPhysicalMaterial color={colors.dark} {...glaze} />
            </mesh>
            <mesh position={[0, -0.0083, 0.0015]} scale={[1, 0.62, 1.4]} castShadow>
              <sphereGeometry args={[0.0045, 20, 14]} />
              <meshPhysicalMaterial color={colors.boot} {...glaze} />
            </mesh>
          </group>
        ))}

        {/* the coat, its belt and buckle */}
        <mesh castShadow receiveShadow>
          <latheGeometry args={[coat, 40]} />
          <meshPhysicalMaterial color={colors.green} {...glaze} />
        </mesh>
        <mesh position-y={0.0142} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.0114, 0.0012, 10, 40]} />
          <meshPhysicalMaterial color={colors.boot} {...glaze} />
        </mesh>
        <mesh position={[0, 0.0142, 0.0121]}>
          <boxGeometry args={[0.0042, 0.0034, 0.0012]} />
          <meshStandardMaterial color={colors.buckle} metalness={0.9} roughness={0.25} />
        </mesh>

        {/* arms, hanging from the shoulders, each with a hand */}
        {[
          { ref: leftArm, x: 0.0082 },
          { ref: rightArm, x: -0.0082 },
        ].map(({ ref, x }) => (
          <group key={x} ref={ref} position={[x, 0.0265, 0]}>
            <mesh position-y={-0.0062} castShadow>
              <capsuleGeometry args={[0.0023, 0.0085, 6, 14]} />
              <meshPhysicalMaterial color={colors.green} {...glaze} />
            </mesh>
            <mesh position-y={-0.0125} castShadow>
              <sphereGeometry args={[0.0026, 16, 12]} />
              <meshPhysicalMaterial color={colors.skin} {...glaze} />
            </mesh>
          </group>
        ))}

        {/* the head: face, eyes, nose, a big white beard, and the tall pointed hat */}
        <group ref={head} position-y={0.03}>
          <mesh position-y={0.0055} castShadow>
            <sphereGeometry args={[0.0078, 28, 20]} />
            <meshPhysicalMaterial color={colors.skin} {...glaze} />
          </mesh>
          <mesh position={[0, -0.0012, 0.0045]} scale={[1.05, 1.35, 0.72]} castShadow>
            <sphereGeometry args={[0.0074, 24, 18]} />
            <meshPhysicalMaterial color={colors.beard} roughness={0.7} clearcoat={0.3} />
          </mesh>
          <mesh position={[0, 0.0048, 0.0082]} castShadow>
            <sphereGeometry args={[0.0028, 16, 12]} />
            <meshPhysicalMaterial color={colors.nose} {...glaze} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.0029, 0.0082, 0.0068]}>
              <sphereGeometry args={[0.0009, 10, 8]} />
              <meshStandardMaterial color="#1d1b19" roughness={0.2} />
            </mesh>
          ))}
          <mesh position-y={0.0093} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.0086, 0.0014, 10, 36]} />
            <meshPhysicalMaterial color={colors.deep} {...glaze} />
          </mesh>
          <mesh position={[0, 0.0255, -0.0018]} rotation-x={-0.14} castShadow>
            <cylinderGeometry args={[0.0004, 0.0092, 0.033, 36]} />
            <meshPhysicalMaterial ref={hat} color={colors.deep} emissive={colors.glow} emissiveIntensity={0} {...glaze} />
          </mesh>
        </group>
      </group>

      {/* an invisible grip a little bigger than he is, so he's easy to catch */}
      <mesh
        position-y={0.034}
        onPointerDown={press}
        onClick={(event) => event.stopPropagation()}
        onPointerOver={(event) => {
          event.stopPropagation()
          walk.current.hovered = true
          onHover(enabled && present)
        }}
        onPointerOut={() => {
          walk.current.hovered = false
          onHover(false)
        }}
      >
        <cylinderGeometry args={[0.02, 0.02, 0.075, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}
