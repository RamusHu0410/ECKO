import GlassButton from '../GlassButton/GlassButton'
import { GNOMES, type GnomeId } from '../../data/gnomes'

interface GnomePickerProps {
  value: GnomeId
  /** While ECKO is answering, the gnome can't be swapped mid-sentence. */
  disabled: boolean
  onChange: (gnome: GnomeId) => void
}

/** Which gnome stands on the turntable: each has his own look, voice and personality. */
export default function GnomePicker({ value, disabled, onChange }: GnomePickerProps) {
  return (
    <div role="group" aria-label="Your gnome" className="flex flex-wrap justify-center gap-2">
      {GNOMES.map((gnome) => (
        <GlassButton
          key={gnome.id}
          aria-pressed={gnome.id === value}
          disabled={disabled}
          onClick={() => onChange(gnome.id)}
          className="px-4 py-2 text-sm disabled:cursor-default disabled:opacity-35"
        >
          <span className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full bg-amber ${gnome.id === value ? '' : 'opacity-0'}`} />
            {gnome.name}
          </span>
        </GlassButton>
      ))}
    </div>
  )
}
