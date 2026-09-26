import { useMemo, type ReactNode } from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { readPressMotion } from '../../design/readToken'

type GlassButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children: ReactNode
}

/** A white glass pill with a spring press. */
export default function GlassButton({ children, className = '', ...buttonProps }: GlassButtonProps) {
  const reducedMotion = useReducedMotion()
  const press = useMemo(readPressMotion, [])

  return (
    <motion.button
      type="button"
      className={`glass-surface glass-control cursor-pointer px-6 py-2.5 text-base font-medium text-ink ${className}`}
      whileTap={reducedMotion ? undefined : { scale: press.scale }}
      transition={press.transition}
      {...buttonProps}
    >
      <span className="glass-content">{children}</span>
    </motion.button>
  )
}
