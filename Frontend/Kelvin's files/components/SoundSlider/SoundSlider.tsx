import { useId } from 'react'

interface SoundSliderProps {
  /** 0 classical piano, 0.5 synth, 1 creepy; anywhere between blends the two nearest. */
  value: number
  disabled: boolean
  onChange: (value: number) => void
}

/** Screen readers hear words, never a number: "Synth", "Between synth and creepy". */
function describe(value: number) {
  if (value < 0.08) return 'Classical piano'
  if (value < 0.42) return 'Between classical piano and synth'
  if (value <= 0.58) return 'Synth'
  if (value <= 0.92) return 'Between synth and creepy'
  return 'Creepy'
}

/**
 * A glass slider that blends the song from classical piano, through synth, to creepy; it stops
 * wherever it's let go. Its track is tinted along the way (--sound-* tokens). Sits in the Your song
 * panel, under Advanced, laid out like the faders above it.
 */
export default function SoundSlider({ value, disabled, onChange }: SoundSliderProps) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1 ${disabled ? 'opacity-35' : ''}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Sound
      </label>
      <input
        id={id}
        type="range"
        className="glass-fader glass-fader-sound"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        aria-valuetext={describe(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="flex justify-between text-xs text-ink-muted" aria-hidden="true">
        <span>Classical piano</span>
        <span>Synth</span>
        <span>Creepy</span>
      </div>
    </div>
  )
}
