import GlassFader from '../GlassFader/GlassFader'
import type { SongSettings } from '../../hooks/useSongSettings'

const FADERS: { name: keyof SongSettings; label: string; low: string; high: string }[] = [
  { name: 'emotion', label: 'Emotion', low: 'Moody', high: 'Bright' },
  { name: 'speed', label: 'Speed', low: 'Slower', high: 'Faster' },
  { name: 'pitch', label: 'Pitch', low: 'Lower', high: 'Higher' },
]

interface AdjustmentsPanelProps {
  settings: SongSettings
  onChange: (changes: Partial<SongSettings>) => void
}

/** A flat glass panel with the three glass faders that shape the song. */
export default function AdjustmentsPanel({ settings, onChange }: AdjustmentsPanelProps) {
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
      </div>
    </div>
  )
}
