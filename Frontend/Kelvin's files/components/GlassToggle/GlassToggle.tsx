import { useId } from 'react'
import GlassButton from '../GlassButton/GlassButton'

interface GlassToggleProps<Option extends string> {
  label: string
  options: readonly Option[]
  value: Option
  onChange: (value: Option) => void
  /** chips: separate glass pills that wrap · segmented: one glass track */
  appearance: 'chips' | 'segmented'
}

/** A labelled pick-one group of glass buttons. */
export default function GlassToggle<Option extends string>({
  label,
  options,
  value,
  onChange,
  appearance,
}: GlassToggleProps<Option>) {
  const labelId = useId()
  const segmented = appearance === 'segmented'

  return (
    <div className="flex flex-col gap-3">
      <span id={labelId} className="text-xs font-medium uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className={segmented ? 'glass-surface glass-control flex w-fit gap-1 p-1' : 'flex flex-wrap gap-2'}
      >
        {options.map((option) => (
          <GlassButton
            key={option}
            variant={segmented ? 'segment' : 'chip'}
            pressed={option === value}
            onClick={() => onChange(option)}
          >
            {option}
          </GlassButton>
        ))}
      </div>
    </div>
  )
}
