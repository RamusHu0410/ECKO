import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

interface HoldOptions {
  /** Whether a new hold can start right now. */
  enabled: boolean
  onPress: () => void
  onRelease: () => void
}

/** Controls that keep the spacebar for themselves: a focused, usable button or slider. */
function isOtherControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement) || target.dataset.holdTarget) return false
  const control = target.closest('button, input, select, textarea, a')
  return control !== null && control.getAttribute('aria-disabled') !== 'true' && !control.matches(':disabled')
}

/**
 * Press-and-hold on the microphone, with the pointer or by holding the spacebar anywhere.
 * Pointer capture keeps the hold going if the finger slides off the mic.
 */
export function useHoldToRecord({ enabled, onPress, onRelease }: HoldOptions) {
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
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
    }
  }, [press, release])

  const pointerHandlers = {
    'data-hold-target': 'true',
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      press()
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    // Space on the focused mic is handled above; stop the button's own click
    onClick: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
  }

  return { holding, pointerHandlers }
}
