import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Matrix4, MeshBasicMaterial, MeshStandardMaterial, type BufferGeometry, type Texture } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { readToken } from '../../design/readToken'
import { CONTROL_Y, FOOT, FRONT, PLATTER, PLINTH, SPEED, TONEARM, TOP } from './dimensions'
import { copies, lathe, turned } from './lathe'
import type { TurntableMaterials } from './materials'
import { floorShadowTexture, letteringTexture, softDiscTexture, useDisposable } from './textures'

/** The walnut photo covers half a meter: about the width of a real board's figure across the plinth. */
const GRAIN_SPAN = 0.5
/** The speed knob points at 33 (the record always turns at 33⅓): a little left of straight up. */
const KNOB_AT_33 = 0.6
/** The audio outputs on the back: left (white) and right (red). */
const JACKS = [
  { x: -0.018, ring: 'white' },
  { x: -0.002, ring: 'red' },
] as const
/** A turned part standing out of the back plate at (x, y), its axis pointing out (along the plate's +z). */
const onBack = (x: number, y: number) => new Matrix4().makeTranslation(x, y, 0.0014).multiply(new Matrix4().makeRotationX(Math.PI / 2))
/** Different parts sharing a material, each copied into its places, as one geometry. */
const mergeParts = (parts: [BufferGeometry, Matrix4[]][]) => mergeGeometries(parts.map(([part, places]) => copies(part, places)))
const FEET = [-1, 1].flatMap((x) => [-1, 1].map((z) => [x * (PLINTH.width / 2 - FOOT.inset), z * (PLINTH.depth / 2 - FOOT.inset)] as const))

/**
 * The plinth: a solid walnut block with crisp, small rounded edges, lacquered satin, standing on
 * four turned feet with rubber pads. Its long faces show the board's grain running along it; its
 * short sides show end grain. On the front, right: the 33/45 speed knob and a small power light;
 * on the back: the audio outputs and power socket. Soft shadows are baked in: under the plinth and
 * each foot, and where the platter and the tonearm's base meet the top.
 */
export default function Plinth3D({ materials }: { materials: TurntableMaterials }) {
  const { gl } = useThree()
  const anisotropy = gl.capabilities.getMaxAnisotropy()
  const font = useMemo(() => readToken('--font-sans'), [])
  const block = useMemo(plinthGeometry, [])
  const parts = useMemo(
    () => ({
      feet: copies(
        turned([[0, FOOT.pad], [FOOT.radius * 0.87, FOOT.pad, 0.0012], [FOOT.radius, FOOT.height - 0.0004, 0.0004], [FOOT.radius, FOOT.height], [0, FOOT.height]], { segments: 48 }),
        FEET.map(([x, z]) => new Matrix4().makeTranslation(x, 0, z)),
      ),
      pads: copies(
        turned([[0, 0], [FOOT.radius * 0.8, 0, 0.0006], [FOOT.radius * 0.82, FOOT.pad], [0, FOOT.pad]], { segments: 40 }),
        FEET.map(([x, z]) => new Matrix4().makeTranslation(x, 0, z)),
      ),
      knob: lathe(
        [
          { points: [[0, 0], [0.0095, 0, 0.0002], [0.0095, 0.0008, 0.0002], [0.0076, 0.0008]] },
          { points: [[0.0075, 0.0012], [0.0075, SPEED.depth - 0.0008, 0.0004]], material: 1 },
          { points: [[SPEED.radius - 0.0007, SPEED.depth, 0.0003], [0, SPEED.depth]] },
        ],
        { segments: 64 },
      ),
      led: turned([[0, 0], [0.0024, 0, 0.0002], [0.0024, 0.0006, 0.0003], [0.0016, 0.0009], [0.0015, 0.0012, 0.0006], [0, 0.0018]], { segments: 32 }),
      // the two sockets, their shells as one part (gold), and the plate's four screws with the ground post (satin)
      rca: copies(
        turned([[0, 0.0015], [0.0042, 0.0015, 0.0002], [0.0042, 0.009, 0.0003], [0.0034, 0.009, 0.0002], [0.0034, 0.004], [0.0012, 0.004], [0.0012, 0.0058, 0.0003], [0, 0.0058]], { segments: 40 }),
        JACKS.map(({ x }) => onBack(x, 0)),
      ),
      satinParts: mergeParts([
        [turned([[0, 0], [0.0045, 0, 0.0002], [0.0045, 0.0028, 0.0003], [0.0026, 0.0028], [0.0026, 0.0068, 0.0006], [0, 0.0068]], { segments: 6, crease: 0.4 }), [onBack(0.015, 0)]],
        [turned([[0, 0], [0.0014, 0, 0], [0.0014, 0.0003, 0.0002], [0, 0.0005]], { segments: 16 }), [-1, 1].flatMap((sx) => [-1, 1].map((sy) => onBack(sx * 0.038, sy * 0.0115)))],
      ]),
      ring: turned([[0, 0], [0.0054, 0, 0.0003], [0.0054, 0.0016, 0.0003], [0, 0.0016]], { segments: 40 }),
      dc: turned([[0, 0], [0.0048, 0, 0.0003], [0.0048, 0.0022, 0.0004], [0.0028, 0.0022], [0.0028, 0.0008], [0, 0.0008]], { segments: 40 }),
      plate: new RoundedBoxGeometry(0.084, 0.03, 0.0014, 2, 0.0006),
    }),
    [],
  )
  const decals = useDisposable(() => ({
    floor: floorShadowTexture(0.9, PLINTH.width * 0.97, PLINTH.depth * 0.95, PLINTH.width / 2 - FOOT.inset, PLINTH.depth / 2 - FOOT.inset, FOOT.radius * 0.8),
    soft: softDiscTexture(0.78),
    speed: letteringTexture(
      [
        { text: '33', x: 0.22, y: 0.5, size: 0.52 },
        { text: '45', x: 0.78, y: 0.5, size: 0.52 },
      ],
      0.044,
      0.01,
      font,
      anisotropy,
    ),
  }))
  const looks = useMemo(
    () => ({
      shadow: (map: Texture, opacity: number) =>
        new MeshBasicMaterial({ color: '#000000', alphaMap: map, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      ink: new MeshStandardMaterial({ envMap: materials.studio, color: '#d6cfc3', roughness: 0.6, alphaMap: decals.speed, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      gold: new MeshStandardMaterial({ envMap: materials.studio, color: '#e6c47e', metalness: 1, roughness: 0.18 }),
      red: new MeshStandardMaterial({ envMap: materials.studio, color: '#8e1f1c', roughness: 0.4 }),
      white: new MeshStandardMaterial({ envMap: materials.studio, color: '#e9e6e0', roughness: 0.4 }),
      power: new MeshStandardMaterial({ envMap: materials.studio, color: '#fff4e0', emissive: '#ffe6bf', emissiveIntensity: 1.6, roughness: 0.2 }),
    }),
    [decals, materials.studio],
  )
  const shadows = useMemo(
    () => ({ floor: looks.shadow(decals.floor, 0.62), platter: looks.shadow(decals.soft, 0.5), armboard: looks.shadow(decals.soft, 0.42) }),
    [looks, decals],
  )
  useEffect(
    () => () => {
      for (const geometry of [block, ...Object.values(parts)]) (geometry as BufferGeometry).dispose()
      for (const material of [...Object.values(shadows), looks.ink, looks.gold, looks.red, looks.white, looks.power]) material.dispose()
    },
    [block, parts, looks, shadows],
  )
  const knurl = useMemo(() => materials.knurled(36, 2), [materials])
  const top = TOP + 0.0002

  return (
    <group>
      {/* soft shadows baked in: under the block and each foot, and where parts meet the top */}
      <mesh position-y={0.0004} rotation-x={-Math.PI / 2} material={shadows.floor} renderOrder={1}>
        <planeGeometry args={[0.9, 0.9]} />
      </mesh>
      <mesh position={[PLATTER.x, top, PLATTER.z]} rotation-x={-Math.PI / 2} material={shadows.platter}>
        <circleGeometry args={[PLATTER.radius * 1.12, 64]} />
      </mesh>
      <mesh position={[TONEARM.x, top, TONEARM.z]} rotation-x={-Math.PI / 2} material={shadows.armboard}>
        <circleGeometry args={[0.037, 40]} />
      </mesh>

      <mesh
        geometry={block}
        material={[materials.endGrain, materials.walnut]}
        position-y={FOOT.height + PLINTH.height / 2}
        castShadow
        receiveShadow
      />
      <mesh geometry={parts.feet} material={materials.anodized} />
      <mesh geometry={parts.pads} material={materials.rubber} />

      {/* the speed knob, pointing at 33, with the speeds printed above it; the power light at its left */}
      <group position={[SPEED.x, CONTROL_Y, FRONT]}>
        <group rotation-x={Math.PI / 2}>
          <mesh geometry={parts.knob} material={[materials.turned, knurl]} rotation-y={KNOB_AT_33}>
            <mesh position={[0, SPEED.depth + 0.00005, -0.0034]} material={materials.recess}>
              <boxGeometry args={[0.0007, 0.0001, 0.0045]} />
            </mesh>
          </mesh>
        </group>
        <mesh position={[0, 0.0135, 0.0002]} material={looks.ink}>
          <planeGeometry args={[0.044, 0.01]} />
        </mesh>
      </group>
      <group position={[SPEED.ledX, CONTROL_Y, FRONT]} rotation-x={Math.PI / 2}>
        <mesh geometry={parts.led} material={materials.chrome} />
        <mesh position-y={0.0009} material={looks.power}>
          <sphereGeometry args={[0.0013, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>

      {/* the back: a brushed plate with the audio outputs (left white, right red), ground and power */}
      <group position={[0.14, CONTROL_Y, -FRONT]} rotation-y={Math.PI}>
        <mesh geometry={parts.plate} material={materials.brushed} position-z={0.0007} />
        {JACKS.map(({ x, ring }) => (
          <group key={x} position={[x, 0, 0.0014]} rotation-x={Math.PI / 2}>
            <mesh geometry={parts.ring} material={looks[ring]} />
          </group>
        ))}
        <mesh geometry={parts.rca} material={looks.gold} />
        <mesh geometry={parts.satinParts} material={materials.satin} />
        <group position={[0.031, 0, 0.0014]} rotation-x={Math.PI / 2}>
          <mesh geometry={parts.dc} material={materials.anodized} />
        </group>
      </group>
    </group>
  )
}

/**
 * The walnut block, its faces mapped in meters so the grain has its real size: along the plinth on
 * the top, front and back (each showing a different part of the board), end grain on the sides.
 */
function plinthGeometry(): BufferGeometry {
  const { width, height, depth } = PLINTH
  const geometry = new RoundedBoxGeometry(width, height, depth, 4, PLINTH.radius)
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (const group of geometry.groups) {
    for (let i = group.start; i < group.start + group.count; i++) {
      const x = position.getX(i) + width / 2
      const y = position.getY(i) + height / 2
      const z = position.getZ(i) + depth / 2
      switch (group.materialIndex) {
        case 0: // the right end: end grain, spanning the face
          uv.setXY(i, 1 - z / depth, y / height)
          break
        case 1: // the left end
          uv.setXY(i, z / depth, y / height)
          break
        case 2: // top
          uv.setXY(i, x / GRAIN_SPAN, z / GRAIN_SPAN)
          break
        case 3: // bottom
          uv.setXY(i, x / GRAIN_SPAN, 0.1 + z / GRAIN_SPAN)
          break
        case 4: // front: the board's edge, lower in the photo
          uv.setXY(i, x / GRAIN_SPAN, 0.74 + y / GRAIN_SPAN)
          break
        default: // back
          uv.setXY(i, 1 - x / GRAIN_SPAN, 0.86 + y / GRAIN_SPAN)
      }
    }
  }
  uv.needsUpdate = true
  // two draws, not six: the ends (the first two faces) and the long grain (the other four)
  const [right, left, ...long] = geometry.groups
  geometry.clearGroups()
  geometry.addGroup(right.start, right.count + left.count, 0)
  geometry.addGroup(long[0].start, long.reduce((sum, face) => sum + face.count, 0), 1)
  return geometry
}
