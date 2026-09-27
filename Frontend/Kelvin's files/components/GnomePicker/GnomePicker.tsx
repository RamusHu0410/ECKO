import GlassButton from '../GlassButton/GlassButton'
import { GNOMES, type GnomeId } from '../../data/gnomes'

interface GnomePickerProps {
  value: GnomeId
  /** While ECKO is answering, the gnome can't be swapped mid-sentence. */
  disabled: boolean
  onChange: (gnome: GnomeId) => void
  /** Two columns of equal buttons, for a narrow side column; otherwise one centred row that wraps. */
  compact?: boolean
}

/** Which gnome stands on the turntable: each has his own look, voice and personality. */
export default function GnomePicker({ value, disabled, onChange, compact = false }: GnomePickerProps) {
  return (
    <div role="group" aria-label="Your gnome" className={compact ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap justify-center gap-2'}>
      {GNOMES.map((gnome) => (
        <GlassButton
          key={gnome.id}
          aria-pressed={gnome.id === value}
          disabled={disabled}
          onClick={() => onChange(gnome.id)}
          className={`py-2 text-sm disabled:cursor-default disabled:opacity-35 ${compact ? 'w-full px-3!' : 'px-4'}`}
        >
          <span className={`flex items-center gap-2 ${compact ? 'justify-center' : ''}`}>
            <span className={`size-1.5 rounded-full bg-amber ${gnome.id === value ? '' : 'opacity-0'}`} />
            {gnome.name}
          </span>
        </GlassButton>
      ))}
    </div>
  )
}
