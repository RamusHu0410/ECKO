import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, CatmullRomCurve3, ExtrudeGeometry, Matrix4, MeshBasicMaterial, Shape, TubeGeometry, Vector3, type BufferGeometry, type Group, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { MAT, PLATTER, PLATTER_TOP, RECORD, RECORD_TOP, TONEARM, TOP } from './dimensions'
import { copies, lathe, turned } from './lathe'
import type { TurntableMaterials } from './materials'
import { softDiscTexture, useDisposable } from './textures'

/** The tube's axis above the plinth's top; where the tube ends and the headshell begins. */
const ARM_Y = TONEARM.height - TOP
const TUBE_END = 0.194
/**
 * The headshell turns in toward the record's center by this offset angle (8°), about a point this
 * far along it, so the whole arm stays inside the lane gnomeWalk.ts keeps the gnome out of.
 */
const OFFSET = 0.14
const HEADSHELL_TURN = 0.016
/** How far the arm tips up when lifted (radians): the stylus rises about 6 mm. */
const LIFT = 0.028
/** Where the arm rests (along the arm at rest) and where the cue lever stands (on the armboard). */
const REST_Z = 0.14
const CUE = { x: 0.016, z: 0.015 }
/** How quickly the arm swings, lifts and lowers, and the clip opens (per second); higher is snappier. */
const SWING = 5
const RISE = 7
const CLIP = 9
/** Where the key light (StudioLights, up at the back-left) throws a shadow, per meter of height. */
const SHADOW_SLANT = { x: 0.56, z: 0.4 }
const TUBE_RADIUS = (z: number) => 0.0042 - (0.0005 * z) / TUBE_END
const toFront = { 'rotation-x': Math.PI / 2 } // a lathe's axis (+y) turned to point along +z
const toBack = { 'rotation-x': -Math.PI / 2 }

/**
 * The tonearm at the plinth's back-right, built like a real one. Standing still: a turned armboard
 * with three screws, a knurled height ring, a black pillar, the cue lever with its lift bar, and the
 * arm rest (a cradle with a clip that closes over the tube). Swinging: the gimbal's bearing housing
 * with its pivot pins, the tapered tube, a knurled counterweight on a decoupling ring, the collar,
 * and the headshell (offset toward the center) with its finger lift, cartridge, cantilever and
 * stylus. While there's a song (playing or paused) the clip opens, the cue lifts the arm, it swings
 * over the record and settles until the stylus touches the grooves; without one it goes home the
 * same way. With reduced motion it simply is where it belongs.
 */
export default function Tonearm3D({ onRecord, reducedMotion, materials }: { onRecord: boolean; reducedMotion: boolean; materials: TurntableMaterials }) {
  const parts = useMemo(armParts, [])
  const maps = useDisposable(() => ({ soft: softDiscTexture(0.35) }))
  const looks = useMemo(
    () => ({
      knurl: materials.knurled(64, 1),
      ring: materials.knurled(40, 1),
      contact: new MeshBasicMaterial({ color: '#000000', alphaMap: maps.soft, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
      baseShadow: new MeshBasicMaterial({ color: '#000000', alphaMap: maps.soft, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      armShadow: new MeshBasicMaterial({ color: '#000000', alphaMap: maps.soft, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    }),
    [materials, maps],
  )
  useEffect(
    () => () => {
      for (const geometry of Object.values(parts)) (geometry as BufferGeometry).dispose()
      for (const material of [looks.contact, looks.baseShadow, looks.armShadow]) material.dispose()
    },
    [parts, looks],
  )

  const yaw = useRef<Group>(null)
  const pitch = useRef<Group>(null)
  const clip = useRef<Group>(null)
  const lever = useRef<Group>(null)
  const bar = useRef<Group>(null)
  const contact = useRef<Mesh>(null)
  const shade = useRef<Mesh>(null)
  const motion = useRef({ yaw: onRecord ? TONEARM.playAngle : TONEARM.restAngle, lift: 0, clip: onRecord ? 1 : 0 })

  useFrame((_, frameSeconds) => {
    const seconds = Math.min(frameSeconds, 0.1)
    const m = motion.current
    const target = onRecord ? TONEARM.playAngle : TONEARM.restAngle
    const away = Math.abs(target - m.yaw) > 0.004
    const home = Math.abs(TONEARM.restAngle - m.yaw) < 0.01
    if (reducedMotion) {
      Object.assign(m, { yaw: target, lift: 0, clip: onRecord ? 1 : 0 })
    } else {
      // clip open → lift → swing → lower; and back: lift → swing home → lower → clip closed
      const ease = (rate: number) => 1 - Math.exp(-seconds * rate)
      const clipWanted = onRecord || !home || m.lift > 0.15 ? 1 : 0
      m.clip += (clipWanted - m.clip) * ease(CLIP)
      m.lift += ((away ? 1 : 0) - m.lift) * ease(RISE)
      if (!away || (m.lift > 0.7 && (m.clip > 0.85 || !onRecord))) m.yaw += (target - m.yaw) * ease(SWING)
    }
    if (yaw.current) yaw.current.rotation.y = m.yaw
    if (pitch.current) pitch.current.rotation.x = -LIFT * m.lift
    if (clip.current) clip.current.rotation.z = -1.25 * m.clip
    if (lever.current) lever.current.rotation.z = -0.12 + 0.55 * m.lift
    if (bar.current) bar.current.position.y = 0.0007 * m.lift

    // the tube's soft shadow on the plinth, cast forward and to the right by the key light (the
    // platter hides it where the arm is over the record)
    if (shade.current) {
      shade.current.position.set(Math.sin(m.yaw) * 0.1 + ARM_Y * SHADOW_SLANT.x, 0.0003, Math.cos(m.yaw) * 0.1 + ARM_Y * SHADOW_SLANT.z)
      shade.current.rotation.z = m.yaw
    }

    // a soft contact shadow under the cartridge, on whatever it's over, darker the closer it gets
    if (contact.current) {
      const along = TUBE_END + HEADSHELL_TURN + 0.007
      const x = Math.sin(m.yaw) * along
      const z = Math.cos(m.yaw) * along
      const r = Math.hypot(TONEARM.x + x - PLATTER.x, TONEARM.z + z - PLATTER.z)
      const surface = r < RECORD.radius ? RECORD_TOP : r < MAT.radius ? PLATTER_TOP + MAT.height : r < PLATTER.radius ? PLATTER_TOP : TOP
      const gap = TONEARM.height - 0.0164 + Math.sin(LIFT * m.lift) * along - surface
      contact.current.position.set(x, surface - TOP + 0.0003, z)
      contact.current.rotation.z = m.yaw - OFFSET
      looks.contact.opacity = 0.6 * Math.max(0, Math.min(1, 1 - (gap - 0.001) / 0.035))
    }
  })

  return (
    <group position={[TONEARM.x, TOP, TONEARM.z]}>
      {/* standing still: the armboard, the pillar and its height ring, the cue lever, the arm rest */}
      <mesh geometry={parts.armboard} material={materials.turned} receiveShadow />
      <mesh geometry={parts.screws} material={materials.chrome} />
      <mesh geometry={parts.ring} material={looks.ring} position-y={0.0026} />
      <mesh geometry={parts.pillar} material={materials.anodized} castShadow />
      <mesh geometry={parts.pin} material={materials.satin} position={[0.0094, ARM_Y - 0.022, 0]} rotation-z={-Math.PI / 2} />

      <group position={[CUE.x, 0.0026, CUE.z]}>
        <mesh geometry={parts.cuePost} material={materials.satin} />
        <mesh geometry={parts.cueHousing} material={materials.anodized} position-y={ARM_Y - 0.0026 - 0.0108} />
        <group ref={bar}>
          <mesh geometry={parts.bar} material={materials.chrome} position={[0.003, ARM_Y - 0.0026 - 0.0056, 0]} rotation-z={Math.PI / 2} />
        </group>
        <group ref={lever} position={[0.004, ARM_Y - 0.0026 - 0.0085, 0]}>
          <mesh geometry={parts.leverArm} material={materials.satin} rotation-z={-Math.PI / 2} />
          <mesh geometry={parts.knob} material={materials.satin} position-x={0.019} />
        </group>
      </group>

      <group position-z={REST_Z}>
        <mesh position-y={0.0002} rotation-x={-Math.PI / 2} material={looks.baseShadow}>
          <circleGeometry args={[0.013, 24]} />
        </mesh>
        <mesh geometry={parts.restPost} material={materials.satin} />
        <mesh geometry={parts.cradle} material={materials.rubber} position={[0, ARM_Y, -0.0035]} />
        <group ref={clip} position={[0.0058, ARM_Y + 0.0006, 0]}>
          <mesh geometry={parts.clip} material={materials.chrome} />
        </group>
      </group>

      <mesh ref={shade} material={looks.armShadow} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.022, 0.26]} />
      </mesh>
      <mesh ref={contact} material={looks.contact} rotation-x={-Math.PI / 2} renderOrder={3}>
        <planeGeometry args={[0.022, 0.034]} />
      </mesh>

      {/* the arm: the bearing housing turns with it; the rest of it also tips up when the cue lifts it */}
      <group ref={yaw} position-y={ARM_Y}>
        <mesh geometry={parts.housing} material={materials.anodized} castShadow />
        <mesh geometry={parts.cap} material={materials.chrome} position-y={0.0075} />
        <mesh geometry={parts.bearings} material={materials.chrome} />
        <group ref={pitch}>
          <mesh geometry={parts.tube} material={materials.satin} {...toFront} castShadow />
          <mesh geometry={parts.stub} material={materials.satin} {...toBack} />
          <mesh geometry={parts.weight} material={[materials.satin, looks.knurl, materials.rubber]} {...toBack} castShadow />
          <mesh geometry={parts.collar} material={[materials.anodized, looks.ring]} position-z={TUBE_END - 0.0095} {...toFront} />
          <group position-z={TUBE_END + HEADSHELL_TURN} rotation-y={-OFFSET}>
            <group position-z={-HEADSHELL_TURN}>
              <mesh geometry={parts.headshell} material={[materials.brushed, materials.satin]} position-y={-0.0039} rotation-x={-Math.PI / 2} castShadow />
              <mesh geometry={parts.slots} material={materials.recess} />
              <mesh geometry={parts.slotScrews} material={materials.chrome} />
              <mesh geometry={parts.fingerLift} material={materials.chrome} />
              <mesh geometry={parts.body} material={materials.plastic} position={[0, -0.0042 - 0.0061, 0.023]} castShadow />
              <mesh geometry={parts.stylusHolder} material={materials.plastic} position={[0, -0.0172, 0.029]} />
              <mesh geometry={parts.cantilever} material={materials.satin} />
              <mesh material={materials.chrome} position={[0, -0.0202, 0.036]}>
                <sphereGeometry args={[0.0003, 10, 6]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

/** Every part's geometry, built once. Turned parts are lathes (see lathe.ts); lengths in meters. */
function armParts() {
  const pillarTop = ARM_Y - 0.011
  const tubeLength = TUBE_END - 0.009
  return {
    armboard: turned([[0, 0], [0.03, 0, 0], [0.03, 0.0026, 0.0005], [0, 0.0026]], { segments: 96 }),
    screws: copies(
      turned([[0, 0], [0.0017, 0, 0], [0.0017, 0.0004, 0.0003], [0, 0.0007]], { segments: 16 }),
      [0.5, 2.6, 4.7].map((angle) => new Matrix4().makeTranslation(Math.cos(angle) * 0.0245, 0.0026, Math.sin(angle) * 0.0245)),
    ),
    ring: turned([[0.0096, 0], [0.0118, 0, 0.0003], [0.0118, 0.006, 0.0003], [0.0096, 0.006]], { segments: 64 }),
    pillar: turned([[0, 0.0086], [0.0095, 0.0086], [0.0095, pillarTop, 0.0006], [0, pillarTop]], { segments: 48 }),
    pin: turned([[0, 0], [0.0016, 0, 0], [0.0016, 0.0035, 0.0003], [0.0024, 0.0035, 0.0002], [0.0024, 0.0048, 0.0003], [0, 0.0048]], { segments: 20 }),
    cuePost: turned([[0, 0], [0.0042, 0, 0.0002], [0.0042, 0.0012, 0.0003], [0.0024, 0.0014], [0.0024, ARM_Y - 0.0026 - 0.0108], [0, ARM_Y - 0.0026 - 0.0108]], { segments: 32 }),
    cueHousing: turned([[0, 0], [0.0046, 0, 0.0005], [0.0046, 0.0068, 0.0007], [0, 0.0068]], { segments: 40 }),
    bar: turned([[0, 0], [0.0011, 0, 0.0004], [0.0011, 0.042, 0.0005], [0, 0.042]], { segments: 16 }),
    leverArm: turned([[0, 0], [0.0009, 0], [0.0009, 0.018], [0, 0.018]], { segments: 12 }),
    knob: turned([[0, -0.0021], [0.0021, 0, 0.0015], [0, 0.0021]], { segments: 20, filletSteps: 6 }),
    restPost: turned([[0, 0], [0.0062, 0, 0.0003], [0.0062, 0.0012, 0.0004], [0.0028, 0.0016], [0.0028, ARM_Y - 0.0058], [0, ARM_Y - 0.0058]], { segments: 32 }),
    cradle: cradleGeometry(),
    clip: new TubeGeometry(
      new CatmullRomCurve3([0, 0.5, 1.1, 1.7, 2.3, 2.75].map((a) => new Vector3(-0.0058 + Math.cos(a) * 0.0055, Math.sin(a) * 0.0055, 0))),
      24,
      0.0006,
      8,
    ),
    housing: turned([[0, -0.0125], [0.0124, -0.0125, 0.0006], [0.0124, 0.0075, 0.0012], [0, 0.0075]], { segments: 64 }),
    cap: turned([[0, 0], [0.0062, 0, 0.0002], [0.0055, 0.0012, 0.001], [0, 0.0022]], { segments: 40 }),
    // the gimbal's pivot pins, one each side of the housing, pointing out
    bearings: copies(
      turned([[0, 0], [0.0032, 0, 0], [0.0032, 0.0022, 0.0003], [0.0022, 0.0028, 0.0003], [0, 0.003]], { segments: 24 }),
      [-1, 1].map((side) => new Matrix4().makeTranslation(side * 0.0122, 0, 0).multiply(new Matrix4().makeRotationZ((side * -Math.PI) / 2))),
    ),
    tube: turned([[0, 0], [TUBE_RADIUS(0), 0], [TUBE_RADIUS(tubeLength), tubeLength], [0, tubeLength]], { segments: 32 }),
    stub: turned([[0, 0], [0.0034, 0], [0.0034, 0.0735, 0.0005], [0, 0.0735]], { segments: 24 }),
    weight: lathe(
      [
        { points: [[0.0036, 0.0405], [0.0106, 0.0405, 0.0004]], material: 2 },
        { points: [[0.0106, 0.0425], [0.0142, 0.0425, 0.0006], [0.0142, 0.0466], [0.0138, 0.0469]] },
        { points: [[0.0142, 0.0472]], material: 1 },
        { points: [[0.0142, 0.0655], [0.0138, 0.0658], [0.0142, 0.0661], [0.0142, 0.0695, 0.0008], [0.0036, 0.0695]] },
      ],
      { segments: 72 },
    ),
    collar: lathe(
      [
        { points: [[0, 0], [0.0052, 0, 0.0004], [0.0052, 0.006]] },
        { points: [[0.0058, 0.0062, 0.0002]], material: 1 },
        { points: [[0.0058, 0.0092, 0.0003], [0, 0.0095]] },
      ],
      { segments: 40 },
    ),
    headshell: headshellGeometry(),
    // the cartridge's two mounting slots in the headshell, and the screws in them
    slots: copies(new BoxGeometry(0.0014, 0.0003, 0.009), [-1, 1].map((side) => new Matrix4().makeTranslation(side * 0.0052, -0.0018, 0.019))),
    slotScrews: copies(
      turned([[0, 0], [0.0011, 0, 0], [0.0011, 0.0004, 0.0003], [0, 0.0008]], { segments: 16 }),
      [-1, 1].map((side) => new Matrix4().makeTranslation(side * 0.0052, -0.002, 0.019)),
    ),
    // the finger lift: a wire curling forward and up off the headshell's nose
    fingerLift: new TubeGeometry(
      new CatmullRomCurve3([new Vector3(0.0042, -0.003, 0.036), new Vector3(0.0046, -0.0026, 0.0425), new Vector3(0.0042, 0.0005, 0.0488), new Vector3(0.0036, 0.0052, 0.0522)]),
      24,
      0.0009,
      10,
    ),
    body: new RoundedBoxGeometry(0.0156, 0.0122, 0.024, 2, 0.0009),
    stylusHolder: new RoundedBoxGeometry(0.0095, 0.005, 0.01, 2, 0.0008),
    cantilever: new TubeGeometry(new CatmullRomCurve3([new Vector3(0, -0.0186, 0.0326), new Vector3(0, -0.0201, 0.036)]), 2, 0.00022, 8),
  }
}

/** The arm rest's cradle: a U the tube drops into, extruded along the arm. */
function cradleGeometry() {
  const inner = TUBE_RADIUS(REST_Z) + 0.0002
  const shape = new Shape()
  shape.moveTo(-0.0056, -inner - 0.0024)
  shape.lineTo(0.0056, -inner - 0.0024)
  shape.lineTo(0.0056, 0.0008)
  shape.lineTo(inner, 0.0008)
  shape.lineTo(inner, 0)
  shape.absarc(0, 0, inner, 0, Math.PI, true)
  shape.lineTo(-inner, 0.0008)
  shape.lineTo(-0.0056, 0.0008)
  shape.closePath()
  return new ExtrudeGeometry(shape, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0003, bevelSegments: 2, curveSegments: 20 })
}

/**
 * The headshell's plate, seen from above: narrow where it meets the collar, widening to carry the
 * cartridge, with rounded front corners (the finger lift curls off its nose). Drawn with +z (along the plate) as −y, then turned flat.
 */
function headshellGeometry() {
  const shape = new Shape()
  shape.moveTo(-0.005, 0)
  shape.lineTo(0.005, 0)
  shape.lineTo(0.0072, -0.01)
  shape.lineTo(0.0072, -0.0375)
  shape.quadraticCurveTo(0.0072, -0.041, 0.0042, -0.041)
  shape.lineTo(-0.0042, -0.041)
  shape.quadraticCurveTo(-0.0072, -0.041, -0.0072, -0.0375)
  shape.lineTo(-0.0072, -0.01)
  shape.closePath()
  return new ExtrudeGeometry(shape, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0003, bevelSegments: 2, curveSegments: 10 })
}
