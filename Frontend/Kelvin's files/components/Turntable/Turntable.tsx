import type { ComponentProps, CSSProperties } from 'react'
import Platter from './Platter'
import Tonearm from './Tonearm'
import ModeButtons from './ModeButtons'
import woodPhoto from '../../assets/textures/MapleWood.avif'

const woodStyle = { '--wood-photo': `url("${woodPhoto}")` } as CSSProperties

interface TurntableProps {
  platter: ComponentProps<typeof Platter>
  tonearm: ComponentProps<typeof Tonearm>
  modes: ComponentProps<typeof ModeButtons>
  /** Once a hum has pressed and uploaded successfully, settle into a top-down birdview. */
  topDown?: boolean
}

/**
 * The turntable, drawn as a CSS 3D box in a top-side three-quarter view: the flat top plate
 * (platter, tonearm) tilted into perspective, with the plinth's front and side faces hanging
 * from its edges and a shadow on the floor plane beneath it.
 */
export default function Turntable({ platter, tonearm, modes, topDown = false }: TurntableProps) {
  return (
    <div className="tt-stage" data-view={topDown ? 'top-down' : 'slant'}>
      <div className="tt-body" style={woodStyle}>
        <div className="tt-ground-shadow" aria-hidden="true" />
        <div className="tt-face tt-face-side" aria-hidden="true" />
        <div className="tt-face tt-face-front">
          <ModeButtons {...modes} />
        </div>
        <div className="tt-top">
          <Platter {...platter} />
          <Tonearm {...tonearm} />
        </div>
      </div>
    </div>
  )
}
