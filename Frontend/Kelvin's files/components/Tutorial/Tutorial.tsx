import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import GlassButton from '../GlassButton/GlassButton'
import { TUTORIAL } from '../../pages/homeCopy'

/** Remembered in this browser once the guide has been seen, so it only opens by itself the first time. */
const SEEN_KEY = 'ecko:tutorial-seen'

/** Whether the guide is showing: open on a first visit, and on demand after that. */
export function useTutorial() {
  const [open, setOpen] = useState(() => !seenBefore())
  const close = useCallback(() => {
    setOpen(false)
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // storage blocked: the guide just opens again next time
    }
  }, [])
  return { open, show: useCallback(() => setOpen(true), []), close }
}

function seenBefore(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

interface TutorialProps {
  onClose: () => void
  reducedMotion: boolean
}

/**
 * A step-by-step guide to ECKO in a glass dialog over the page: humming, the record, the faders,
 * talking to the gnome, picking a gnome, blending the sound and keeping songs. Escape or Skip
 * closes it; the last step's button closes it and goes down to the studio.
 */
export default function Tutorial({ onClose, reducedMotion }: TutorialProps) {
  const [step, setStep] = useState(0)
  const dialog = useRef<HTMLDivElement>(null)
  const last = step === TUTORIAL.steps.length - 1
  const { title, body } = TUTORIAL.steps[step]

  useEffect(() => {
    dialog.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const finish = () => {
    onClose()
    document.getElementById('studio')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/25 px-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        tabIndex={-1}
        className="glass-surface glass-panel w-full max-w-md px-7 py-7 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="glass-content">
          <p className="text-xs font-semibold tracking-widest text-ink-muted uppercase">
            {TUTORIAL.title} · {step + 1} of {TUTORIAL.steps.length}
          </p>
          <h2 id="tutorial-title" className="mt-3 font-display text-3xl leading-tight text-ink">
            {title}
          </h2>
          <p className="mt-3 min-h-28 leading-relaxed text-ink-muted" aria-live="polite">
            {body}
          </p>

          {/* where you are: a dot per step, the current one amber */}
          <div className="mt-5 flex gap-1.5" aria-hidden="true">
            {TUTORIAL.steps.map((each, index) => (
              <span key={each.title} className={`h-1.5 rounded-full transition-all ${index === step ? 'w-5 bg-amber' : 'w-1.5 bg-ink-muted/30'}`} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" onClick={onClose} className="cursor-pointer text-sm text-ink-muted underline-offset-4 hover:underline">
              {TUTORIAL.skip}
            </button>
            <div className="flex gap-2">
              {step > 0 && <GlassButton onClick={() => setStep(step - 1)}>{TUTORIAL.back}</GlassButton>}
              <GlassButton onClick={last ? finish : () => setStep(step + 1)}>{last ? TUTORIAL.finish : TUTORIAL.next}</GlassButton>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
