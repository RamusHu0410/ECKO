import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { hash } from './textures'

/*
 * The plinth's walnut, made from the maple photo (assets/textures/MapleWood.avif) and in code:
 * the photo's grain, stretched in contrast and mapped onto walnut's browns, for the long-grain
 * faces; and end grain (growth rings and pores across a few glued-up boards) for the short sides,
 * which soak up more finish and so look darker and more matte.
 */

/** Walnut, from the grain lines to the lighter figure (sRGB). */
const WALNUT: [number, [number, number, number]][] = [
  [0, [24, 14, 9]],
  [0.3, [52, 32, 21]],
  [0.62, [84, 55, 37]],
  [1, [112, 78, 54]],
]

/**
 * The long-grain walnut: a color map, and a roughness map in which the dark grain lines and pores
 * are a little rougher than the lacquered figure around them.
 */
export function walnutTextures(photo: CanvasImageSource & { width: number; height: number }, anisotropy: number) {
  const width = photo.width
  const height = photo.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(photo, 0, 0)
  const pixels = context.getImageData(0, 0, width, height)
  const data = pixels.data

  // the photo's brightness, stretched so its faint maple grain spans the whole walnut range
  const luma = new Float32Array(width * height)
  const counts = new Uint32Array(256)
  for (let i = 0; i < luma.length; i++) {
    luma[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]
    counts[Math.min(255, Math.round(luma[i]))]++
  }
  const percentile = (share: number) => {
    let seen = 0
    for (let level = 0; level < 256; level++) if ((seen += counts[level]) >= share * luma.length) return level
    return 255
  }
  const low = percentile(0.01)
  const high = percentile(0.99)

  const roughness = context.createImageData(width, height)
  for (let i = 0; i < luma.length; i++) {
    const t = Math.pow(Math.min(1, Math.max(0, (luma[i] - low) / (high - low))), 1.35)
    const [r, g, b] = gradient(t)
    data.set([r, g, b, 255], i * 4)
    const rough = Math.round(255 * (0.36 + 0.3 * (1 - t)))
    roughness.data.set([rough, rough, rough, 255], i * 4)
  }
  context.putImageData(pixels, 0, 0)
  const color = new CanvasTexture(canvas)
  color.colorSpace = SRGBColorSpace

  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = width
  roughCanvas.height = height
  roughCanvas.getContext('2d')!.putImageData(roughness, 0, 0)
  const rough = new CanvasTexture(roughCanvas)

  for (const texture of [color, rough]) {
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.anisotropy = anisotropy
  }
  return { color, roughness: rough }
}

/**
 * End grain for the plinth's short sides, `length` × `height` meters: a glue-up of boards 4–7 cm
 * wide, each showing arcs of its growth rings (the heart alternately above and below, as boards
 * are glued), faint rays, and the open pores walnut is known for.
 */
export function endGrainTexture(length: number, height: number, anisotropy: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  const perMeter = 2600
  canvas.width = Math.round(length * perMeter)
  canvas.height = Math.round(height * perMeter)
  const context = canvas.getContext('2d')!
  context.fillStyle = 'rgb(58, 37, 25)'
  context.fillRect(0, 0, canvas.width, canvas.height)

  let seed = 11
  const random = () => hash(seed++)
  let start = 0
  for (let board = 0; start < canvas.width; board++) {
    const boardWidth = (0.04 + random() * 0.03) * perMeter
    context.save()
    context.beginPath()
    context.rect(start, 0, boardWidth, canvas.height)
    context.clip()

    // this board's heart: off to one side, well above or below the face
    const heartX = start + boardWidth * (0.2 + random() * 0.6)
    const reach = (0.05 + random() * 0.18) * perMeter
    const heartY = board % 2 ? -reach : canvas.height + reach
    const farthest = Math.hypot(Math.max(heartX - start, start + boardWidth - heartX), Math.abs(heartY) + canvas.height)
    let radius = Math.max(0, Math.abs(heartY) - canvas.height - 10)
    while (radius < farthest) {
      const ring = (0.0022 + random() * 0.0024) * perMeter
      // earlywood: a lighter band; latewood: a darker line at the ring's outer edge
      context.lineWidth = ring * 0.55
      context.strokeStyle = `rgba(92, 62, 42, ${0.18 + random() * 0.12})`
      context.beginPath()
      context.arc(heartX, heartY, radius + ring * 0.3, 0, Math.PI * 2)
      context.stroke()
      context.lineWidth = 1.2 + random() * 1.4
      context.strokeStyle = `rgba(26, 15, 9, ${0.35 + random() * 0.25})`
      context.beginPath()
      context.arc(heartX, heartY, radius + ring, 0, Math.PI * 2)
      context.stroke()
      radius += ring
    }
    // rays, fanning out from the heart
    context.strokeStyle = 'rgba(110, 76, 52, 0.18)'
    context.lineWidth = 1
    for (let ray = 0; ray < 14; ray++) {
      const angle = (board % 2 ? Math.PI / 2 : -Math.PI / 2) + (random() - 0.5) * 1.2
      context.beginPath()
      context.moveTo(heartX, heartY)
      context.lineTo(heartX + Math.cos(angle) * farthest, heartY + Math.sin(angle) * farthest)
      context.stroke()
    }
    context.restore()
    // the glue line between boards
    context.fillStyle = 'rgba(20, 11, 6, 0.55)'
    context.fillRect(start + boardWidth - 1, 0, 1.5, canvas.height)
    start += boardWidth
  }

  // pores: tiny dark dots all over, a few a little bigger
  for (let pore = 0; pore < canvas.width * canvas.height * 0.02; pore++) {
    const size = random() < 0.9 ? 1 : 2
    context.fillStyle = `rgba(14, 8, 5, ${0.25 + random() * 0.4})`
    context.fillRect(random() * canvas.width, random() * canvas.height, size, size)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = anisotropy
  return texture
}

/** The walnut color at t (0 the darkest grain, 1 the lightest figure). */
function gradient(t: number): [number, number, number] {
  for (let stop = 1; stop < WALNUT.length; stop++) {
    const [at, to] = WALNUT[stop]
    const [before, from] = WALNUT[stop - 1]
    if (t <= at) {
      const k = (t - before) / (at - before)
      return [0, 1, 2].map((c) => Math.round(from[c] + (to[c] - from[c]) * k)) as [number, number, number]
    }
  }
  return WALNUT[WALNUT.length - 1][1]
}
