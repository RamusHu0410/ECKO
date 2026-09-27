import type { MotionValue } from 'motion/react'
import type { DiscState } from './textures'
import { useTurntableMaterials } from './materials'
import Plinth3D from './Plinth3D'
import Platter3D from './Platter3D'
import Tonearm3D from './Tonearm3D'
import HumKey3D from './HumKey3D'
import Gnome3D, { type GnomeProps } from './Gnome3D'

export interface TurntableModelProps {
  /** Platter angle in degrees from useTurntable (it already runs at 33⅓ rpm, spins up and down). */
  rotation: MotionValue<number>
  disc: DiscState
  /** The glass has been pressed into vinyl. */
  isVinyl: boolean
  /** Tapping the record pauses and resumes it while it plays. */
  tappable: boolean
  onTap: () => void
  onRecord: boolean
  reducedMotion: boolean
  /** The mic is recording a hum: the HUM button is pressed in and its LED lit. */
  humming: boolean
  /** The gnome who stands on the turntable once there's a song; hold him to talk. */
  gnome: Omit<GnomeProps, 'onHover' | 'reducedMotion'>
  /** Reports whether the pointer is over something that can be clicked (for the hand cursor). */
  onHover: (over: boolean) => void
}

/**
 * The turntable: a solid walnut plinth on four feet, a machined-aluminum platter with a felt mat
 * and the record, the tonearm, the HUM button on the front, and the gnome once there's a song.
 * Its parts share one set of materials, lit by the bundled studio (materials.ts).
 */
export default function TurntableModel(props: TurntableModelProps) {
  const { rotation, disc, isVinyl, tappable, onTap, onRecord, reducedMotion, onHover } = props
  const materials = useTurntableMaterials()
  if (!materials) return null

  return (
    <group>
      <Plinth3D materials={materials} />
      <Platter3D
        rotation={rotation}
        disc={disc}
        isVinyl={isVinyl}
        tappable={tappable}
        onTap={onTap}
        onHover={onHover}
        reducedMotion={reducedMotion}
        materials={materials}
      />
      <Tonearm3D onRecord={onRecord} reducedMotion={reducedMotion} materials={materials} />
      <HumKey3D humming={props.humming} materials={materials} />
      <Gnome3D {...props.gnome} onHover={onHover} reducedMotion={reducedMotion} />
    </group>
  )
}
