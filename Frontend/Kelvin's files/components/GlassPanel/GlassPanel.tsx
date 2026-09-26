import { useMemo, useRef, type ReactNode } from 'react'
import LiquidGlass from 'liquid-glass-react'
import { useElementSize } from '../../hooks/useElementSize'
import { readNumberToken } from '../../design/readToken'

/**
 * liquid-glass-react's SVG refraction only renders in Chromium. `navigator.userAgentData`
 * exists only in Chromium browsers, so Safari, Firefox and every iPhone browser (all WebKit)
 * get the CSS glass from glass.css instead.
 */
const supportsRefraction =
  (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands.some(
    ({ brand }) => brand === 'Chromium',
  ) ?? false

interface GlassPanelProps {
  children: ReactNode
  className?: string
}

/**
 * The large round hero glass the disc is made of: refracting liquid glass in Chromium,
 * layered CSS glass elsewhere. Children fill it edge to edge.
 */
export default function GlassPanel({ children, className = '' }: GlassPanelProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(surfaceRef)
  const tuning = useMemo(readRefractionTuning, [])

  // memoized so the refraction layer doesn't re-render when only the children change.
  // Blur, brightness and saturation come from glass.css, which overrides the library's own.
  const refraction = useMemo(() => {
    if (!supportsRefraction || !size) return null
    return (
      <div className="glass-refraction" aria-hidden="true">
        <LiquidGlass
          key={`${size.width}x${size.height}`}
          style={{ position: 'absolute', top: '50%', left: '50%' }}
          padding="0"
          cornerRadius={size.width / 2}
          displacementScale={tuning.displacementScale}
          aberrationIntensity={tuning.aberrationIntensity}
          elasticity={tuning.elasticity}
          mode="polar"
          mouseContainer={surfaceRef}
        >
          <div style={{ width: size.width, height: size.height }} />
        </LiquidGlass>
      </div>
    )
  }, [size, tuning])

  return (
    <div
      ref={surfaceRef}
      className={`glass-surface glass-disc ${className}`}
      data-refraction={refraction ? 'on' : undefined}
    >
      {refraction}
      <div className="glass-content">{children}</div>
    </div>
  )
}

function readRefractionTuning() {
  return {
    displacementScale: readNumberToken('--glass-displacement'),
    aberrationIntensity: readNumberToken('--glass-aberration'),
    elasticity: readNumberToken('--glass-elasticity'),
  }
}
