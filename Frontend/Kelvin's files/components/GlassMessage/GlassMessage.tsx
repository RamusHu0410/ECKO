import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { appear } from '../../design/motion'

interface GlassMessageProps {
  title: string
  body: string
  /** Technical detail in small print, e.g. what the backend said. */
  detail?: string
  /** The buttons that fix it. */
  actions: ReactNode
}

/**
 * A friendly glass card that explains a problem and offers the way out. Compact and wide
 * (text left, buttons right) so it fits below the disc without the page scrolling; stacked
 * on phones, where there is room below the disc.
 */
export default function GlassMessage({ title, body, detail, actions }: GlassMessageProps) {
  return (
    <motion.div
      role="alert"
      className="glass-surface glass-message flex w-[min(44rem,calc(100vw-2rem))] flex-col items-center gap-4 px-6 py-4 text-center sm:flex-row sm:text-left"
      {...appear}
    >
      <div className="glass-content flex flex-1 flex-col gap-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm leading-snug text-ink">{body}</p>
        {detail && <p className="text-xs leading-snug break-words text-ink/70">{detail}</p>}
      </div>
      <div className="glass-content flex shrink-0 gap-2">{actions}</div>
    </motion.div>
  )
}
