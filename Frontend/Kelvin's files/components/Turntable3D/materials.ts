import { useEffect, useMemo, useState } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import {
  Color,
  Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  PMREMGenerator,
  TextureLoader,
  type Texture,
} from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import studioUrl from '../../assets/hdri/studio.exr?url'
import woodPhoto from '../../assets/textures/MapleWood.avif'
import { PLINTH } from './dimensions'
import { brushedMetalTexture, feltTexture, knurlNormalTexture } from './textures'
import { endGrainTexture, walnutTextures } from './woodTextures'

/*
 * The turntable's physically based materials, made once and shared by its parts. Everything the
 * turntable is made of reflects the studio in assets/hdri/studio.exr (a photo studio: a large
 * softbox up at the top-left where the key light is, two strip lights, a grey sweep and dark flags
 * that give the metal its contrast). Only the turntable uses it: the gnome keeps the scene's own
 * environment and lights (StudioLights), so he looks just as he did.
 */

/** The button hole in the plinth's front: pixels a hole mask has marked are left for the button's recess. */
export const HOLE_STENCIL = 1

export interface TurntableMaterials {
  studio: Texture
  /** Long-grain walnut (top, front, back), under a satin lacquer. */
  walnut: MeshPhysicalMaterial
  /** End grain on the short sides: darker and more matte, it drinks the finish. */
  endGrain: MeshPhysicalMaterial
  /** Machined aluminum turned on a lathe: fine rings that stretch highlights across them (needs lathe tangents). */
  turned: MeshPhysicalMaterial
  /** Bead-blasted, satin aluminum. */
  satin: MeshStandardMaterial
  /** Linear-brushed aluminum (plates and the button's face). */
  brushed: MeshStandardMaterial
  chrome: MeshStandardMaterial
  /** Black anodized aluminum: the feet, the arm's pillar and bearing housing. */
  anodized: MeshPhysicalMaterial
  /** Diamond-knurled stainless steel (the counterweight's and the knob's grip); `knurled(repeat)` for each part. */
  knurled: (around: number, along: number) => MeshStandardMaterial
  rubber: MeshStandardMaterial
  /** The cartridge's glossy black body. */
  plastic: MeshPhysicalMaterial
  felt: MeshPhysicalMaterial
  /** The inside of the button's recess: dark, soft. */
  recess: MeshStandardMaterial
}

/**
 * The studio as a prefiltered environment map (loaded with the turntable, ~190 kB). It's made in an
 * effect, not a memo: a render target can't be rebuilt once disposed, and React may dispose and
 * redo effects at any time (StrictMode does so on purpose). Null until it's ready.
 */
function useStudio(): Texture | null {
  const { gl } = useThree()
  const equirect = useLoader(EXRLoader, studioUrl)
  const [studio, setStudio] = useState<Texture | null>(null)
  useEffect(() => {
    const generator = new PMREMGenerator(gl)
    const target = generator.fromEquirectangular(equirect)
    generator.dispose()
    setStudio(target.texture)
    return () => {
      setStudio(null)
      target.dispose()
    }
  }, [gl, equirect])
  return studio
}

/** The turntable's materials; null for the moment it takes to prefilter the studio after loading. */
export function useTurntableMaterials(): TurntableMaterials | null {
  const { gl } = useThree()
  const studio = useStudio()
  const photo = useLoader(TextureLoader, woodPhoto)
  const anisotropy = gl.capabilities.getMaxAnisotropy()

  const materials = useMemo(() => {
    if (!studio) return null
    const wood = walnutTextures(photo.image as HTMLImageElement, anisotropy)
    const endGrain = endGrainTexture(PLINTH.depth, PLINTH.height, anisotropy)
    const brushedStreaks = brushedMetalTexture()
    brushedStreaks.repeat.set(3, 12)
    const knurl = knurlNormalTexture()
    const fibers = feltTexture(anisotropy)
    fibers.repeat.set(9, 9) // across the mat's top: a tile every 3.5 cm
    const env = { envMap: studio, envMapIntensity: 1 }
    const extras: Material[] = [] // the knurled parts' own materials
    const hole = { stencilWrite: true, stencilRef: HOLE_STENCIL, stencilFunc: NotEqualStencilFunc }

    const made: TurntableMaterials = {
      studio,
      walnut: new MeshPhysicalMaterial({
        ...env,
        ...hole,
        map: wood.color,
        roughnessMap: wood.roughness,
        roughness: 1,
        clearcoat: 0.6,
        clearcoatRoughness: 0.26,
        specularIntensity: 0.5,
      }),
      endGrain: new MeshPhysicalMaterial({
        ...env,
        map: endGrain,
        roughness: 0.78,
        clearcoat: 0.45,
        clearcoatRoughness: 0.5,
        specularIntensity: 0.5,
      }),
      turned: new MeshPhysicalMaterial({
        ...env,
        color: '#e3e5e8',
        metalness: 1,
        roughness: 0.28,
        anisotropy: 0.8,
        anisotropyRotation: Math.PI / 2,
      }),
      satin: new MeshStandardMaterial({ ...env, color: '#d9dcdf', metalness: 1, roughness: 0.34 }),
      brushed: new MeshStandardMaterial({ ...env, color: '#d6d8db', metalness: 1, roughness: 0.62, roughnessMap: brushedStreaks }),
      chrome: new MeshStandardMaterial({ ...env, color: '#f2f3f4', metalness: 1, roughness: 0.07 }),
      anodized: new MeshPhysicalMaterial({ ...env, color: '#1d1e21', metalness: 0.55, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
      knurled: (around, along) => {
        const map = knurl.clone()
        map.repeat.set(around, along)
        const material = new MeshStandardMaterial({ ...env, color: '#d7d9dc', metalness: 1, roughness: 0.3, normalMap: map })
        extras.push(material)
        return material
      },
      rubber: new MeshStandardMaterial({ ...env, color: '#121212', roughness: 0.88, envMapIntensity: 0.6 }),
      plastic: new MeshPhysicalMaterial({ ...env, color: '#0d0d0e', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
      felt: new MeshPhysicalMaterial({
        ...env,
        map: fibers,
        color: '#2b2b2d',
        roughness: 1,
        sheen: 1,
        sheenColor: new Color('#4d4d50'),
        sheenRoughness: 0.55,
        envMapIntensity: 0.7,
      }),
      recess: new MeshStandardMaterial({ ...env, color: '#0b0b0c', metalness: 0.4, roughness: 0.6, envMapIntensity: 0.4 }),
    }
    return { made, extras, textures: [wood.color, wood.roughness, endGrain, brushedStreaks, knurl, fibers] }
  }, [photo, studio, anisotropy])

  useEffect(
    () => () => {
      if (!materials) return
      materials.textures.forEach((texture) => texture.dispose())
      for (const part of [...Object.values(materials.made), ...materials.extras]) if (part instanceof Material) part.dispose()
      for (const knurled of materials.extras) (knurled as MeshStandardMaterial).normalMap?.dispose()
    },
    [materials],
  )
  return materials?.made ?? null
}
