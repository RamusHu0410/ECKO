import { useId } from 'react'

interface GlassFaderProps {
  label: string
  /** Plain words at each end, e.g. Moody and Bright. */
  low: string
  high: string
  /** 0 (low end) to 1 (high end). */
  value: number
  onChange: (value: number) => void
}

/** Screen readers hear a word, never a number: "Bright", "A little moody", "Balanced". */
function describe(value: number, low: string, high: string) {
  if (value < 0.2) return low
  if (value < 0.42) return `A little ${low.toLowerCase()}`
  if (value <= 0.58) return 'Balanced'
  if (value <= 0.8) return `A little ${high.toLowerCase()}`
  return high
}

/** A glass slider with a plain word at each end. */
export default function GlassFader({ label, low, high, value, onChange }: GlassFaderProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="glass-fader"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-valuetext={describe(value, low, high)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="flex justify-between text-xs text-ink-muted" aria-hidden="true">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}
