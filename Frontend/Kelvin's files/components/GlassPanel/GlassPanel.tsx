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

/** liquid-glass-react blurs by a base of 4px plus blurAmount × 32px. */
const LIBRARY_BASE_BLUR_PX = 4
const LIBRARY_BLUR_STEP_PX = 32

interface GlassPanelProps {
  children: ReactNode
  /** "disc" makes a circle; children then fill it edge to edge. */
  shape?: 'panel' | 'disc'
  className?: string
}

/** A large hero glass surface: refracting liquid glass in Chromium, layered CSS glass elsewhere. */
export default function GlassPanel({ children, shape = 'panel', className = '' }: GlassPanelProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(surfaceRef)
  const tuning = useMemo(readRefractionTuning, [])

  // memoized so the refraction layer doesn't re-render when only the children change
  const refraction = useMemo(() => {
    if (!supportsRefraction || !size) return null
    return (
      <div className="glass-refraction" aria-hidden="true">
        <LiquidGlass
          key={`${size.width}x${size.height}`}
          style={{ position: 'absolute', top: '50%', left: '50%' }}
          padding="0"
          cornerRadius={shape === 'disc' ? size.width / 2 : tuning.panelRadius}
          displacementScale={tuning.displacementScale}
          blurAmount={tuning.blurAmount}
          saturation={tuning.saturation}
          aberrationIntensity={tuning.aberrationIntensity}
          elasticity={tuning.elasticity}
          mouseContainer={surfaceRef}
        >
          <div style={{ width: size.width, height: size.height }} />
        </LiquidGlass>
      </div>
    )
  }, [size, shape, tuning])

  return (
    <div
      ref={surfaceRef}
      className={`glass-surface ${shape === 'disc' ? 'glass-disc' : ''} ${className}`}
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
    blurAmount: Math.max(0, (readNumberToken('--blur-glass') - LIBRARY_BASE_BLUR_PX) / LIBRARY_BLUR_STEP_PX),
    saturation: readNumberToken('--saturate-glass'),
    aberrationIntensity: readNumberToken('--glass-aberration'),
    elasticity: readNumberToken('--glass-elasticity'),
    panelRadius: readNumberToken('--radius-panel'),
  }
}
