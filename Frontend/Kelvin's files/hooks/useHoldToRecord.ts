import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent } from 'react'

interface HoldOptions {
  /** Whether a new hold can start right now. */
  enabled: boolean
  onPress: () => void
  onRelease: () => void
  /**
   * anywhere: holding the spacebar anywhere on the page holds (the microphone) ·
   * focused: only Space or Enter on the focused control does (the gnome's keyboard button)
   */
  keys?: 'anywhere' | 'focused'
}

/** Controls that keep the spacebar for themselves: a focused, usable button or slider. */
function isOtherControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement) || target.dataset.holdTarget) return false
  const control = target.closest('button, input, select, textarea, a')
  return control !== null && control.getAttribute('aria-disabled') !== 'true' && !control.matches(':disabled')
}

const isHoldKey = (code: string) => code === 'Space' || code === 'Enter' || code === 'NumpadEnter'

/**
 * Press-and-hold, with the pointer or the keyboard. Pointer capture keeps the hold going if the
 * finger slides off. `press` and `release` are for things that aren't page elements (the 3D gnome).
 */
export function useHoldToRecord({ enabled, onPress, onRelease, keys = 'anywhere' }: HoldOptions) {
  const [holding, setHolding] = useState(false)
  const holdingRef = useRef(false)
  const latest = useRef({ enabled, onPress, onRelease })
  useEffect(() => {
    latest.current = { enabled, onPress, onRelease }
  })

  const press = useCallback(() => {
    if (holdingRef.current || !latest.current.enabled) return
    holdingRef.current = true
    setHolding(true)
    latest.current.onPress()
  }, [])

  const release = useCallback(() => {
    if (!holdingRef.current) return
    holdingRef.current = false
    setHolding(false)
    latest.current.onRelease()
  }, [])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isOtherControl(event.target)) return
      event.preventDefault()
      press()
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !holdingRef.current) return
      event.preventDefault()
      release()
    }
    if (keys === 'anywhere') {
      window.addEventListener('keydown', down)
      window.addEventListener('keyup', up)
    }
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
    }
  }, [press, release, keys])

  const pointerHandlers = {
    ...(keys === 'anywhere'
      ? { 'data-hold-target': 'true' }
      : {
          onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
            if (!isHoldKey(event.code)) return
            event.preventDefault()
            if (!event.repeat) press()
          },
          onKeyUp: (event: ReactKeyboardEvent<HTMLElement>) => {
            if (!isHoldKey(event.code)) return
            event.preventDefault()
            release()
          },
          onBlur: release,
        }),
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      press()
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    // Space on the focused control is handled above; stop the button's own click
    onClick: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
  }

  return { holding, press, release, pointerHandlers }
}
