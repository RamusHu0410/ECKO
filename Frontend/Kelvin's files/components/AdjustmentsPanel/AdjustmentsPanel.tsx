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
}

/** A flat glass panel with the three glass faders that shape the song, and Advanced folded below them. */
export default function AdjustmentsPanel({ settings, onChange, advanced }: AdjustmentsPanelProps) {
  return (
    <div className="glass-surface glass-panel w-full max-w-72 px-6 py-6">
      <div className="glass-content flex flex-col gap-5">
        <h2 className="text-xs font-semibold tracking-widest text-ink-muted uppercase">Your song</h2>
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
        <div className="border-t border-hairline pt-4">
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
