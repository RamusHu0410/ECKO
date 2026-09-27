import GlassButton from '../GlassButton/GlassButton'
import type { SongVersion } from '../../hooks/useSong'

interface VersionPickerProps {
  playing: SongVersion
  available: { epic: boolean; hum: boolean }
  onChoose: (version: 'epic' | 'hum') => void
}

const VERSIONS = [
  { id: 'epic', name: 'Epic' },
  { id: 'hum', name: 'Pure hum' },
] as const

/**
 * Which version of the song plays: Epic, the first song ECKO made from the hum (kept whatever the
 * faders or talk change later), or Pure hum, just the notes that were hummed. While an edit plays,
 * neither is lit; pressing one goes back to it.
 */
export default function VersionPicker({ playing, available, onChoose }: VersionPickerProps) {
  return (
    <div className="glass-surface glass-panel px-5 py-5" data-tour="versions">
      <div className="glass-content flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-widest text-ink-muted uppercase">Version</h2>
        <div role="group" aria-label="Version" className="grid grid-cols-2 gap-2">
          {VERSIONS.map((version) => (
            <GlassButton
              key={version.id}
              aria-pressed={playing === version.id}
              disabled={!available[version.id]}
              onClick={() => onChoose(version.id)}
              className="w-full px-3! py-2 text-sm disabled:cursor-default disabled:opacity-35"
            >
              <span className="flex items-center justify-center gap-2">
                <span className={`size-1.5 rounded-full bg-amber ${playing === version.id ? '' : 'opacity-0'}`} />
                {version.name}
              </span>
            </GlassButton>
          ))}
        </div>
        <p className="text-xs leading-snug text-ink-muted">
          {playing === 'edited' ? 'Playing your edit. Epic brings back the first song.' : 'Epic: the first song ECKO made. Pure hum: just your notes.'}
        </p>
      </div>
    </div>
  )
}
