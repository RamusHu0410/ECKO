import type { ReactNode } from 'react'
import GlassFader from '../GlassFader/GlassFader'
import type { Slider, SongSettings } from '../../hooks/useSongSettings'

const FADERS: { name: Slider; label: string; low: string; high: string }[] = [
  { name: 'emotion', label: 'Emotion', low: 'Moody', high: 'Bright' },
  { name: 'speed', label: 'Speed', low: 'Slower', high: 'Faster' },
  { name: 'pitch', label: 'Pitch', low: 'Lower', high: 'Higher' },
]

interface AdjustmentsPanelProps {
  settings: SongSettings
  onChange: (changes: Partial<SongSettings>) => void
  /** The Advanced section folded under the faders: whether it's open, and what it holds. */
  advanced: { open: boolean; onToggle: () => void; children: ReactNode }
  /** Puts the faders and the Sound blend back to the middle; off when they're all there already. */
  reset: { onReset: () => void; disabled: boolean }
}

/**
 * A flat glass panel with the three glass faders that shape the song, Advanced folded below them,
 * and Reset. It fills the width it's given (the studio's side column). The data-tour marks are
 * what the guide's arrows point at.
 */
export default function AdjustmentsPanel({ settings, onChange, advanced, reset }: AdjustmentsPanelProps) {
  return (
    <div className="glass-surface glass-panel w-full px-6 py-6" data-tour="faders">
      <div className="glass-content flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-widest text-ink-muted uppercase">Your song</h2>
          <button
            type="button"
            onClick={reset.onReset}
            disabled={reset.disabled}
            data-tour="reset"
            className="cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium text-ink underline-offset-4 hover:underline disabled:cursor-default disabled:text-ink-muted disabled:no-underline disabled:opacity-60"
          >
            Reset
          </button>
        </div>
        {FADERS.map((fader) => (
          <GlassFader
            key={fader.name}
            label={fader.label}
            low={fader.low}
            high={fader.high}
            value={settings[fader.name]}
            onChange={(value) => onChange({ [fader.name]: value })}
          />
        ))}
        <div className="border-t border-hairline pt-4" data-tour="advanced">
          <button
            type="button"
            aria-expanded={advanced.open}
            onClick={advanced.onToggle}
            className="flex w-full cursor-pointer items-center justify-between text-xs font-semibold tracking-widest text-ink-muted uppercase"
          >
            Advanced
            <span aria-hidden="true" className={`text-base transition-transform ${advanced.open ? 'rotate-90' : ''}`}>
              ›
            </span>
          </button>
          {advanced.open && <div className="mt-4">{advanced.children}</div>}
        </div>
      </div>
    </div>
  )
}
