import { useLayoutEffect, useState, type RefObject } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/** Tracks an element's layout size. Transforms (the press scale, the vinyl spin) don't affect it. */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = () => {
      const width = element.offsetWidth
      const height = element.offsetHeight
      setSize((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height },
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
