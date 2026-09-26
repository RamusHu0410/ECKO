import { useMemo, type ReactNode } from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { readPressMotion } from '../../design/readToken'

type GlassButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children: ReactNode
  /** chip: small glass pill · segment: plain text until selected · action: larger glass pill */
  variant?: 'chip' | 'segment' | 'action'
  /** Selected state for toggle buttons, shown in amber. */
  pressed?: boolean
}

const SIZE_CLASSES = {
  chip: 'px-4 py-2 text-sm',
  segment: 'px-4 py-1.5 text-sm',
  action: 'px-6 py-2.5 text-base',
}

/** A small CSS-glass button with a spring press. */
export default function GlassButton({ children, variant = 'chip', pressed, className = '', ...buttonProps }: GlassButtonProps) {
  const reducedMotion = useReducedMotion()
  const press = useMemo(readPressMotion, [])
  const surface = variant === 'segment' && !pressed ? 'glass-segment' : 'glass-surface glass-control'

  return (
    <motion.button
      type="button"
      aria-pressed={pressed}
      className={`${surface} ${SIZE_CLASSES[variant]} cursor-pointer font-medium text-ink ${className}`}
      whileTap={reducedMotion ? undefined : { scale: press.scale }}
      transition={press.transition}
      {...buttonProps}
    >
      <span className="glass-content">{children}</span>
    </motion.button>
  )
}
