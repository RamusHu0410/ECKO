import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { RECORD_TOP, TONEARM, TOP } from './dimensions'

const METAL = { color: '#e2e5e8', metalness: 1, roughness: 0.22 }
const DARK = { color: '#1d1b19', metalness: 0.2, roughness: 0.55 }
/** Height of the arm above the plinth's top, and how far the straight tube runs before the headshell. */
const ARM_Y = TONEARM.height - TOP
const TUBE = TONEARM.length - 0.04
/** How quickly the arm swings to where it's going (per second); higher is snappier. */
const SWING = 5

/**
 * A slim tonearm at the plinth's back-right: base, pivot post, counterweight, tube and a headshell
 * angled toward the record's center. It swings onto the record while there's a song (playing or
 * paused) and back to its rest post otherwise; with reduced motion it jumps there.
 */
export default function Tonearm3D({ onRecord, reducedMotion }: { onRecord: boolean; reducedMotion: boolean }) {
  const arm = useRef<Group>(null)

  useFrame((_, seconds) => {
    if (!arm.current) return
    const target = onRecord ? TONEARM.playAngle : TONEARM.restAngle
    const turn = arm.current.rotation
    turn.y = reducedMotion ? target : turn.y + (target - turn.y) * (1 - Math.exp(-seconds * SWING))
  })

  return (
    <group position={[TONEARM.x, TOP, TONEARM.z]}>
      {/* the parts that stay still: base, turret, post, and the rest the arm lies on */}
      <mesh position-y={0.003} castShadow receiveShadow>
        <cylinderGeometry args={[0.034, 0.034, 0.006, 48]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position-y={0.013} castShadow>
        <cylinderGeometry args={[0.022, 0.024, 0.014, 40]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position-y={(0.02 + ARM_Y) / 2} castShadow>
        <cylinderGeometry args={[0.007, 0.007, ARM_Y - 0.02, 20]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <group position-z={TUBE - 0.03}>
        <mesh position-y={(ARM_Y - 0.006) / 2} castShadow>
          <cylinderGeometry args={[0.004, 0.005, ARM_Y - 0.006, 16]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        {/* the little cradle the arm lies in */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.0052, ARM_Y - 0.0035, 0]} castShadow>
            <boxGeometry args={[0.0022, 0.006, 0.008]} />
            <meshStandardMaterial {...DARK} />
          </mesh>
        ))}
      </group>

      {/* the arm itself, which swings about the pivot */}
      <group ref={arm} position-y={ARM_Y}>
        <mesh castShadow>
          <sphereGeometry args={[0.011, 24, 16]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        <mesh position-z={TUBE / 2} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.0032, 0.0032, TUBE, 16]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        <mesh position-z={-0.024} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.004, 0.004, 0.034, 12]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        <mesh position-z={-0.05} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.015, 0.015, 0.03, 40]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        <group position-z={TUBE + 0.016} rotation-y={-0.38}>
          <mesh position-y={-0.002} castShadow>
            <boxGeometry args={[0.018, 0.004, 0.036]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
          <mesh position={[0.014, -0.001, 0.012]} castShadow>
            <boxGeometry args={[0.014, 0.002, 0.004]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
          {/* the cartridge, its stylus just above the record */}
          <mesh position={[0, -(ARM_Y - (RECORD_TOP - TOP)) / 2 - 0.002, 0.004]} castShadow>
            <boxGeometry args={[0.012, ARM_Y - (RECORD_TOP - TOP) - 0.006, 0.018]} />
            <meshStandardMaterial {...DARK} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
