import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { BackSide, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, SphereGeometry, type Side } from 'three'

/**
 * The scene's light. One soft key light, from the top-left of the view (behind and left of the
 * turntable), casts the shadows: they fall forward to the bottom-right, onto an invisible floor over
 * the white page. A warm sky/ground fill and a small studio built in code (a dim warm room, a large
 * softbox up at the top-left, a thin strip light to the right and a white floor) light the gnome's
 * glaze; the turntable's own materials reflect the bundled studio HDRI instead (materials.ts), so
 * changing that never changes how the gnome looks.
 */
export default function StudioLights() {
  const { gl, scene } = useThree()

  useEffect(() => {
    const generator = new PMREMGenerator(gl)
    const studio = studioScene()
    const environment = generator.fromScene(studio, 0.02).texture
    scene.environment = environment
    scene.environmentIntensity = 1
    return () => {
      scene.environment = null
      environment.dispose()
      generator.dispose()
      studio.traverse((part) => {
        if (part instanceof Mesh) {
          part.geometry.dispose()
          part.material.dispose()
        }
      })
    }
  }, [gl, scene])

  return (
    <>
      <hemisphereLight args={['#fffaf2', '#e8e2d8', 0.6]} />
      <directionalLight
        position={[-0.7, 1.25, -0.5]}
        color="#fff3e2"
        intensity={2.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-radius={14}
        shadow-blurSamples={20}
        shadow-bias={-0.0004}
        shadow-normalBias={0.01}
        shadow-camera-left={-0.55}
        shadow-camera-right={0.55}
        shadow-camera-top={0.55}
        shadow-camera-bottom={-0.55}
        shadow-camera-near={0.3}
        shadow-camera-far={3}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <shadowMaterial opacity={0.2} />
      </mesh>
    </>
  )
}

/** The studio the gnome reflects. Brightness above 1 makes the lights brighter than the white walls would be. */
function studioScene(): Scene {
  const studio = new Scene()
  const glow = (brightness: number, color = 0xffffff, side: Side = DoubleSide) => {
    const material = new MeshBasicMaterial({ color, side })
    material.color.multiplyScalar(brightness)
    return material
  }
  studio.add(new Mesh(new SphereGeometry(10, 32, 16), glow(0.2, 0xf1ebe3, BackSide)))

  const lights: [width: number, height: number, position: [number, number, number], brightness: number][] = [
    [7, 5, [-3.5, 6, -3], 6], // the softbox at the top-left
    [0.9, 6, [5.5, 2.5, 1], 3], // a strip light on the right
    [5, 2, [0, 2, 6], 1.4], // a soft fill from the front
  ]
  for (const [width, height, position, brightness] of lights) {
    const light = new Mesh(new PlaneGeometry(width, height), glow(brightness))
    light.position.set(...position)
    light.lookAt(0, 0, 0)
    studio.add(light)
  }
  const floor = new Mesh(new PlaneGeometry(30, 30), glow(0.35, 0xf4f1ec))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -1
  studio.add(floor)
  return studio
}
