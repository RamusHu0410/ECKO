import { compact, type Vote } from '../../data/community'

interface VoteButtonsProps {
  score: number
  vote: Vote
  /** What is being voted on, for screen readers ("Four notes and a kettle", "Mira's comment"). */
  label: string
  onVote: (vote: Vote) => void
  /** Stacked beside a post, or in a row under a comment. */
  layout?: 'column' | 'row'
}

/**
 * Up, the score, down. Pressing the arrow already chosen takes the vote back. The score turns
 * amber when this person has voted up, and muted ink when they have voted down.
 */
export default function VoteButtons({ score, vote, label, onVote, layout = 'column' }: VoteButtonsProps) {
  const column = layout === 'column'
  const tone = vote === 1 ? 'text-amber' : vote === -1 ? 'text-ink-muted' : 'text-ink'

  return (
    <div className={`flex shrink-0 items-center ${column ? 'flex-col gap-0.5' : 'gap-1'}`}>
      <Arrow up pressed={vote === 1} label={`Upvote ${label}`} onClick={() => onVote(vote === 1 ? 0 : 1)} />
      <span className={`min-w-6 text-center text-xs font-semibold tabular-nums ${tone}`} aria-label={`Score ${score}`}>
        {compact(score)}
      </span>
      <Arrow up={false} pressed={vote === -1} label={`Downvote ${label}`} onClick={() => onVote(vote === -1 ? 0 : -1)} />
    </div>
  )
}

function Arrow({ up, pressed, label, onClick }: { up: boolean; pressed: boolean; label: string; onClick: () => void }) {
  const colour = pressed ? (up ? 'text-amber' : 'text-ink') : 'text-ink-muted hover:text-ink'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={`grid size-7 cursor-pointer place-items-center rounded-full hover:bg-hairline focus-visible:outline-2 focus-visible:outline-amber ${colour}`}
    >
      <svg viewBox="0 0 24 24" className={`size-4 ${up ? '' : 'rotate-180'}`} fill={pressed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4 4.5 12.5H9V20h6v-7.5h4.5z" />
      </svg>
    </button>
  )
}
