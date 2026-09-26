/*
 * Reads design tokens from tokens.css at runtime, for code that can't use CSS directly:
 * canvas drawing, motion springs and animation timings.
 */

type TokenName = `--${string}`

export function readToken(name: TokenName): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** A numeric token with its unit dropped: "1200ms" → 1200, "24px" → 24, "31%" → 31. */
export function readNumberToken(name: TokenName): number {
  return Number.parseFloat(readToken(name))
}

/** The spring press shared by every button: scale down on press, spring back on release. */
export function readPressMotion() {
  return {
    scale: readNumberToken('--spring-press-scale'),
    transition: {
      type: 'spring' as const,
      stiffness: readNumberToken('--spring-press-stiffness'),
      damping: readNumberToken('--spring-press-damping'),
    },
  }
}
