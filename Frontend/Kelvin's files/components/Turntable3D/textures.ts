import { useEffect, useMemo } from 'react'
import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace, type Texture } from 'three'
import { drawDiscFill, type DiscFrame } from '../../drawing/drawDiscFill'
import { readDiscLook } from '../../design/readToken'
import { VINYL } from './dimensions'

/*
 * The turntable's textures, all drawn in code so nothing extra is downloaded: the record's printed
 * face (the same drawing as the flat disc) and the maps that make its grooves shine, knurling for
 * the knobs and weights, brushed-metal streaks, engraved lettering, and soft shadows. The wood's
 * textures are in woodTextures.ts.
 */

/** The record is drawn at 1024 CSS pixels, twice over: a 2048-pixel texture that stays crisp up close. */
const DISC_SIZE = 1024
const DISC_PIXEL_RATIO = 2

export type DiscState = Omit<DiscFrame, 'size' | 'look'>

/** The record's face as a texture, redrawn whenever the disc's state changes (glass, liquid, vinyl). */
export function useDiscTexture(disc: DiscState, anisotropy: number): CanvasTexture {
  const look = useMemo(readDiscLook, [])
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = DISC_SIZE * DISC_PIXEL_RATIO
    const made = new CanvasTexture(canvas)
    made.colorSpace = SRGBColorSpace
    made.anisotropy = anisotropy
    return made
  }, [anisotropy])
  useEffect(() => () => texture.dispose(), [texture])

  const { fillProgress, levels, levelsPerRecording, liveLevel, pressProgress, reducedMotion } = disc
  useEffect(() => {
    const context = (texture.image as HTMLCanvasElement).getContext('2d')
    if (!context) return
    context.setTransform(DISC_PIXEL_RATIO, 0, 0, DISC_PIXEL_RATIO, 0, 0)
    drawDiscFill(context, { fillProgress, levels, levelsPerRecording, liveLevel, pressProgress, reducedMotion, size: DISC_SIZE, look })
    texture.needsUpdate = true
  }, [texture, look, fillProgress, levels, levelsPerRecording, liveLevel, pressProgress, reducedMotion])

  return texture
}

/**
 * How the record's surface reflects, from the spindle out (read along uv1.v, the radius): a matte
 * paper label, the mirror-smooth run-out with its locked groove, the grooves (they scatter light
 * across themselves, so highlights stretch into the radial streaks real vinyl shows, a little
 * uneven from track to track), the smooth gaps between tracks, the lead-in and the glossy rim.
 * `roughness` is a roughness map (green channel); `anisotropy` a three.js anisotropy map whose
 * direction points along the bitangent, which on the lathe's top faces is the radius.
 */
export function recordSurfaceMaps(labelRatio: number): { roughness: DataTexture; anisotropy: DataTexture } {
  const rows = 2048
  const rough = new Uint8Array(rows * 4)
  const aniso = new Uint8Array(rows * 4)
  for (let row = 0; row < rows; row++) {
    const f = (row + 0.5) / rows
    const wobble = hash(Math.floor(f * 900)) - 0.5 // bands about 0.16 mm wide, each a touch different
    const track = hash(Math.floor(f * 11) + 7) - 0.5
    let roughness = 0.14
    let strength = 0
    if (f < labelRatio) roughness = 0.8 + wobble * 0.08
    else if (f < labelRatio + 0.004) roughness = 0.45
    else if (f < VINYL.inner) {
      roughness = 0.07
      strength = 0.12
      if (Math.abs(f - (VINYL.inner - 0.03)) < 0.0015) [roughness, strength] = [0.28, 0.85] // the locked groove
    } else if (f < VINYL.outer) {
      const gap = VINYL.gaps.some((at) => Math.abs(f - at) < 0.0035)
      roughness = gap ? 0.08 : 0.3 + track * 0.05 + wobble * 0.05
      strength = gap ? 0.2 : 0.9 + wobble * 0.08
    } else if (f < VINYL.lip) {
      roughness = 0.1
      strength = 0.35
    }
    rough.set([255, byte(roughness), 0, 255], row * 4)
    aniso.set([128, 255, byte(strength), 255], row * 4)
  }
  const make = (data: Uint8Array) => {
    const texture = new DataTexture(data, 1, rows, RGBAFormat)
    texture.channel = 1
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
  }
  return { roughness: make(rough), anisotropy: make(aniso) }
}

/**
 * Diamond knurling as a tangent-space normal map (a small tile of four-sided pyramids), for the
 * counterweight and the speed knob. It reads uv1: around the part × along it.
 */
export function knurlNormalTexture(): DataTexture {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  const ridge = (t: number) => Math.abs(((t % 1) + 1) % 1 - 0.5) * 2 // a triangle wave, 0..1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const height = (at: number, bt: number) => Math.min(ridge(at + bt), ridge(at - bt))
      const e = 1 / size
      const dx = (height(u + e, v) - height(u - e, v)) / (2 * e)
      const dy = (height(u, v + e) - height(u, v - e)) / (2 * e)
      const scale = 0.12
      const n = [-dx * scale, -dy * scale, 1]
      const length = Math.hypot(n[0], n[1], n[2])
      data.set([byte(0.5 + (0.5 * n[0]) / length), byte(0.5 + (0.5 * n[1]) / length), byte(0.5 + (0.5 * n[2]) / length), 255], (y * size + x) * 4)
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.channel = 1
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/** Felt: short, tangled fibers, light on a dark ground, for the mat's color (it tiles). */
export function feltTexture(anisotropy: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const context = canvas.getContext('2d')!
  context.fillStyle = 'rgb(200, 200, 200)'
  context.fillRect(0, 0, 256, 256)
  let seed = 3
  for (let fiber = 0; fiber < 2600; fiber++) {
    const x = hash(seed++) * 256
    const y = hash(seed++) * 256
    const angle = hash(seed++) * Math.PI
    const length = 2 + hash(seed++) * 7
    const shade = Math.round(150 + hash(seed++) * 105)
    context.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, 0.55)`
    context.lineWidth = 0.6
    context.beginPath()
    for (const offset of [-256, 0]) {
      // drawn twice where it crosses an edge, so the tile has no seam
      context.moveTo(x + offset * Number(x > 250), y + offset * Number(y > 250))
      context.lineTo(x + offset * Number(x > 250) + Math.cos(angle) * length, y + offset * Number(y > 250) + Math.sin(angle) * length)
    }
    context.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.anisotropy = anisotropy
  return texture
}

/** Fine streaks along the texture's width, like brushed aluminum. Grey around the middle, for a roughness map. */
export function brushedMetalTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.fillStyle = 'rgb(120, 120, 120)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  for (let streak = 0; streak < 2400; streak++) {
    const shade = Math.round(70 + Math.random() * 110)
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.45)`
    context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 30 + Math.random() * 220, 1)
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  return texture
}

/** A piece of lettering: text centered at (x, y), both fractions of the texture, `size` a fraction of its height. */
export interface Lettering {
  text: string
  x: number
  y: number
  size: number
  weight?: number
}

/**
 * Engraved or printed lettering as an alpha map (white where the ink or the cut is), in the site's
 * own font and letter-spaced. `width` × `height` is the decal's size in meters.
 */
export function letteringTexture(lettering: Lettering[], width: number, height: number, font: string, anisotropy: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.height = 256
  canvas.width = Math.round((canvas.height * width) / height)
  const context = canvas.getContext('2d')!
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#fff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (const { text, x, y, size, weight = 600 } of lettering) {
    context.font = `${weight} ${Math.round(canvas.height * size)}px ${font}`
    context.fillText(text.split('').join(' '), canvas.width * x, canvas.height * y) // thin spaces: letter-spaced
  }
  const texture = new CanvasTexture(canvas)
  texture.anisotropy = anisotropy
  return texture
}

/**
 * A soft round shadow for contact and ambient-occlusion decals: solid out to `core` (a fraction of
 * the radius), then fading smoothly to nothing at the edge. White on black, for an alpha map.
 */
export function softDiscTexture(core: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
  for (let step = 0; step <= 12; step++) {
    const t = step / 12
    const fade = t <= core ? 1 : Math.pow(1 - (t - core) / (1 - core), 2.2)
    gradient.addColorStop(t, `rgb(${Math.round(fade * 255)}, ${Math.round(fade * 255)}, ${Math.round(fade * 255)})`)
  }
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)
  return new CanvasTexture(canvas)
}

/**
 * The soft shadow right under the plinth, as a product photo has, with a darker contact shadow
 * under each foot: drawn for a floor patch `span` meters wide, around a plinth of `width` × `depth`
 * with its feet at (±footX, ±footZ). White on black, for an alpha map.
 */
export function floorShadowTexture(span: number, width: number, depth: number, footX: number, footZ: number, footRadius: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1024
  const context = canvas.getContext('2d')!
  const toPixels = canvas.width / span
  const middle = canvas.width / 2
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  // the broad shade under the whole block (drawn off the canvas; only its blurred shadow lands on it)
  context.shadowColor = 'rgba(255, 255, 255, 0.72)'
  context.shadowBlur = 0.035 * toPixels
  context.shadowOffsetX = canvas.width
  context.fillStyle = '#fff'
  context.beginPath()
  context.roundRect(middle - (width / 2) * toPixels - canvas.width, middle - (depth / 2) * toPixels, width * toPixels, depth * toPixels, 0.01 * toPixels)
  context.fill()
  // tight, dark contact under each foot
  context.shadowColor = 'rgba(255, 255, 255, 1)'
  context.shadowBlur = 0.006 * toPixels
  for (const x of [-footX, footX]) {
    for (const z of [-footZ, footZ]) {
      context.beginPath()
      context.arc(middle + x * toPixels - canvas.width, middle + z * toPixels, footRadius * toPixels, 0, Math.PI * 2)
      context.fill()
    }
  }
  return new CanvasTexture(canvas)
}

/** Textures made once, kept for as long as the component that made them. */
export function useDisposable<T extends Record<string, Texture>>(make: () => T): T {
  const made = useMemo(make, []) // made once: `make` is a fresh closure every render
  useEffect(() => () => Object.values(made).forEach((texture) => texture.dispose()), [made])
  return made
}

const byte = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255)

/** A steady pseudo-random number in [0, 1) for an integer. */
export function hash(index: number) {
  let t = (index * 2654435761) >>> 0
  t ^= t >>> 15
  t = Math.imul(t, 2246822519) >>> 0
  t ^= t >>> 13
  return (t >>> 0) / 4_294_967_296
}
