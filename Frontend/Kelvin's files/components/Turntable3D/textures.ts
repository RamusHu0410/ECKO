import { useEffect, useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { drawDiscFill, type DiscFrame } from '../../drawing/drawDiscFill'
import { readDiscLook, readToken } from '../../design/readToken'

/*
 * The turntable's textures, all drawn on canvases so nothing is downloaded: the record's face (the
 * same drawing as the flat disc), brushed-metal streaks, the printed labels on the keys and the
 * soft shadow under the plinth.
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

/** A key's printed front: its name, dark on the light key, in the site's own font. */
export function keyLabelTexture(label: string, anisotropy: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 720 // the key's front is 72 × 30 mm
  canvas.height = 300
  const context = canvas.getContext('2d')!
  context.fillStyle = readToken('--color-key')
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = readToken('--color-ink')
  context.font = `700 ${canvas.height * 0.42}px ${readToken('--font-sans')}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label.split('').join('\u2009'), canvas.width / 2, canvas.height * 0.54) // thin spaces: letter-spaced like the CSS keys
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = anisotropy
  return texture
}

/**
 * The soft shadow right under the plinth, as a product photo has: a rounded rectangle half the
 * texture's size, blurred. (The shape is drawn off the canvas; only its blurred shadow lands on it.)
 */
export function softShadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const context = canvas.getContext('2d')!
  context.shadowColor = 'rgba(0, 0, 0, 1)'
  context.shadowBlur = 56
  context.shadowOffsetX = canvas.width
  context.beginPath()
  context.roundRect(canvas.width * 0.25 - canvas.width, canvas.height * 0.25, canvas.width * 0.5, canvas.height * 0.5, 24)
  context.fill()
  return new CanvasTexture(canvas)
}
