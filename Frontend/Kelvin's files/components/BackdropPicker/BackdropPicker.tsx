import { useState } from 'react'
import { BACKDROPS, applyBackdrop, savedBackdrop, type BackdropId } from '../../design/backdrops'

/**
 * The Profile page's background setting: a preview of each background to pick from. The pick shows
 * at once on every page and is remembered in this browser.
 */
export default function BackdropPicker() {
  const [picked, setPicked] = useState<BackdropId>(savedBackdrop)

  const pick = (id: BackdropId) => {
    setPicked(id)
    applyBackdrop(id)
  }

  return (
    <section aria-labelledby="background-title" className="glass-surface glass-panel px-6 py-5">
      <div className="glass-content flex flex-col gap-4">
        <div>
          <h2 id="background-title" className="text-xs font-semibold tracking-widest text-ink-muted uppercase">
            Background
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Try one behind the glass. It shows on every page.</p>
        </div>
        <div role="radiogroup" aria-labelledby="background-title" className="flex flex-wrap gap-4">
          {BACKDROPS.map((backdrop) => (
            <button
              key={backdrop.id}
              type="button"
              role="radio"
              aria-checked={picked === backdrop.id}
              onClick={() => pick(backdrop.id)}
              className="group flex cursor-pointer flex-col items-center gap-1.5"
            >
              <span
                data-backdrop={backdrop.id}
                className={`backdrop-swatch block size-14 rounded-2xl shadow-sm ring-offset-2 transition ${
                  picked === backdrop.id ? 'ring-2 ring-amber' : 'ring-1 ring-hairline group-hover:ring-ink-muted'
                }`}
              />
              <span className={`text-xs ${picked === backdrop.id ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{backdrop.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
