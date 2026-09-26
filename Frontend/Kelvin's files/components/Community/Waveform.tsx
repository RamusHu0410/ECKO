/**
 * A song's loudness as a row of rounded bars. Amber while it plays, so the post that is making
 * the sound is the one that looks alive.
 */
export default function Waveform({ peaks, playing }: { peaks: number[]; playing: boolean }) {
  return (
    <div className="flex h-9 min-w-0 flex-1 items-center gap-[2px]" aria-hidden="true">
      {peaks.map((peak, index) => (
        <span
          key={index}
          className={`min-w-0 flex-1 rounded-full transition-colors duration-300 ${playing ? 'bg-amber' : 'bg-ink-muted/45'}`}
          style={{ height: `${Math.max(10, peak * 100)}%` }}
        />
      ))}
    </div>
  )
}
