import { motion } from 'motion/react'
import DiscCanvas from '../Turntable/DiscCanvas'
import { INTRO, TOUR } from '../../pages/homeCopy'

/** A gentle swell for the melody pressed into the intro record, the shape a hum leaves. */
const SAMPLE_LEVELS = Array.from({ length: 200 }, (_, i) => 0.45 + 0.35 * Math.sin(i / 6) * Math.sin(i / 29))

/**
 * What ECKO is, at a glance: the promise, the three steps set like the track list on a record
 * sleeve, and a finished ECKO record turning slowly beside them. Both links lead down to the studio;
 * "How to use ECKO" starts the guided tour of the studio.
 */
export default function Intro({ reducedMotion, onShowGuide }: { reducedMotion: boolean; onShowGuide: () => void }) {
  return (
    <section aria-labelledby="intro-title" className="intro">
      <div className="relative z-10 max-w-xl">
        <h1 id="intro-title" className="font-display text-[clamp(3rem,6vw,5.75rem)] leading-[0.98] tracking-tight text-ink">
          {INTRO.title.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-muted">{INTRO.lede}</p>

        <p className="mt-10 text-xs font-semibold tracking-widest text-ink-muted uppercase">{INTRO.side}</p>
        <ol className="mt-3 border-b border-hairline">
          {INTRO.tracks.map((track, index) => (
            <li key={track.title} className="grid grid-cols-[3rem_1fr] border-t border-hairline py-3.5">
              <span className="font-display text-2xl leading-none text-amber" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <p className="font-medium text-ink">{track.title}</p>
                <p className="mt-1 text-sm leading-snug text-ink-muted">{track.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="#studio" className="glass-surface glass-control inline-block px-6 py-2.5 font-medium text-ink">
            <span className="glass-content">{INTRO.start}</span>
          </a>
          <button type="button" onClick={onShowGuide} className="cursor-pointer px-2 py-2.5 font-medium text-ink underline-offset-4 hover:underline">
            {TOUR.reopen}
          </button>
        </div>
      </div>

      {/* a finished ECKO record, turning slowly; its sheen stays still, as the light would */}
      <div className="intro-record" aria-hidden="true">
        <motion.div
          className="absolute inset-0"
          animate={reducedMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 48, ease: 'linear', repeat: Infinity }}
        >
          <DiscCanvas
            fillProgress={1}
            levels={SAMPLE_LEVELS}
            levelsPerRecording={SAMPLE_LEVELS.length}
            liveLevel={0}
            pressProgress={1}
            reducedMotion={reducedMotion}
          />
        </motion.div>
        <span className="vinyl-sheen" data-visible="true" />
      </div>

      <a href="#studio" className="intro-cue">
        {INTRO.scroll}
        <span className="intro-cue-line" aria-hidden="true" />
      </a>
    </section>
  )
}
