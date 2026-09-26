import { useState } from 'react'
import RecordDisc from '../components/RecordDisc/RecordDisc'
import GlassPanel from '../components/GlassPanel/GlassPanel'
import GlassToggle from '../components/GlassToggle/GlassToggle'

const STYLES = ['Lo-fi', 'Orchestral', 'Synthwave', 'Acoustic', 'Cinematic'] as const
const MOODS = ['Bright', 'Moody'] as const
const ENERGIES = ['Chill', 'Steady', 'Upbeat'] as const

interface SongPreferences {
  style: (typeof STYLES)[number]
  mood: (typeof MOODS)[number]
  energy: (typeof ENERGIES)[number]
}

// TODO(backend): send the hum and these preferences to the Flask backend (the WAV goes to
// POST /upload as a form field named "file"), then start song generation and playback.
async function requestSong(_audio: Blob, _preferences: SongPreferences): Promise<void> {}

export default function HomePage() {
  const [preferences, setPreferences] = useState<SongPreferences>({
    style: 'Lo-fi',
    mood: 'Bright',
    energy: 'Steady',
  })

  const choose = <Key extends keyof SongPreferences>(key: Key) =>
    (value: SongPreferences[Key]) => setPreferences((current) => ({ ...current, [key]: value }))

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center px-5 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
      <h1 className="font-display text-5xl tracking-wide text-ink">ECKO</h1>

      <section aria-label="Record your hum" className="mt-12 sm:mt-16">
        <RecordDisc onRecorded={(audio) => void requestSong(audio, preferences)} />
      </section>

      <GlassPanel className="mt-12 w-full sm:mt-16">
        <div className="flex flex-col gap-7 p-6 sm:p-8">
          <GlassToggle label="Style" appearance="chips" options={STYLES} value={preferences.style} onChange={choose('style')} />
          <div className="flex flex-wrap gap-x-10 gap-y-7">
            <GlassToggle label="Mood" appearance="segmented" options={MOODS} value={preferences.mood} onChange={choose('mood')} />
            <GlassToggle label="Energy" appearance="segmented" options={ENERGIES} value={preferences.energy} onChange={choose('energy')} />
          </div>
        </div>
      </GlassPanel>
    </main>
  )
}
