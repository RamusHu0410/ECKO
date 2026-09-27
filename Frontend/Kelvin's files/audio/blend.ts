import { ENGINE_ORDER } from '../api/generateAccompaniment'

/**
 * How loud each version plays at a sound slider position, in ENGINE_ORDER (piano, synth, creepy):
 * 0 is only the classical piano, 0.5 only the synth, 1 only the creepy one. In between, the two
 * nearest versions share the sound. It's an equal-power blend (cosine and sine), so halfway is as
 * loud as either end rather than quieter.
 */
export function blendVolumes(mix: number): number[] {
  const along = Math.min(1, Math.max(0, mix)) * (ENGINE_ORDER.length - 1) // 0 to 2
  const left = Math.min(Math.floor(along), ENGINE_ORDER.length - 2) // the version to the left of the knob
  const angle = (along - left) * (Math.PI / 2)
  const volumes = ENGINE_ORDER.map(() => 0)
  volumes[left] = Math.cos(angle)
  volumes[left + 1] = Math.sin(angle)
  return volumes
}

/** Which version the slider is closest to (its place in ENGINE_ORDER), e.g. the one kept on the profile page. */
export function nearestVersion(mix: number): number {
  return Math.round(Math.min(1, Math.max(0, mix)) * (ENGINE_ORDER.length - 1))
}
