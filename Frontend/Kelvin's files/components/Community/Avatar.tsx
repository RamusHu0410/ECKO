import type { Author } from '../../data/community'

/** A person's initials in an ink circle. TODO(backend): a real avatar image once accounts exist. */
export default function Avatar({ author, size = 'md' }: { author: Author; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-6 text-[11px]' : 'size-8 text-sm'
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-ink font-display text-page ${box}`} aria-hidden="true">
      {author.initials}
    </span>
  )
}
