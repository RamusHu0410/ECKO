import type { Mode } from '../../hooks/useMode'

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'hum', label: 'HUM' },
  { mode: 'talk', label: 'TALK' },
]

interface ModeButtonsProps {
  mode: Mode
  onChange: (mode: Mode) => void
  /** While the mic is live the keys can't change. */
  disabled?: boolean
}

/** HUM / TALK keys beside the microphone, styled like a turntable's speed buttons. */
export default function ModeButtons({ mode, onChange, disabled = false }: ModeButtonsProps) {
  return (
    <div className="tt-keys" role="radiogroup" aria-label="Input">
      {MODES.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={mode === option.mode}
          className="tt-key"
          disabled={disabled}
          onClick={() => onChange(option.mode)}
        >
          <span className="tt-led" aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  )
}
