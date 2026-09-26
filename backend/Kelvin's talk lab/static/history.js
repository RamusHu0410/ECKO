// Version history for the song settings: every change adds a version, undo steps back one.
// No page code in here, so it can move into the main app (for example a useTalk hook) as is.

export const START = { emotion: 0.5, speed: 0.5, pitch: 0.5, style: null, extras: [] }

export function createHistory(start = START) {
  const versions = [{ settings: start, label: 'Start' }]
  return {
    current: () => versions.at(-1).settings,
    /** The version before this one, sent with every command so "undo" can be spoken too. */
    previous: () => versions.at(-2)?.settings ?? null,
    all: () => versions.slice(),
    canUndo: () => versions.length > 1,
    push(settings, label) {
      versions.push({ settings, label })
    },
    undo() {
      if (versions.length > 1) versions.pop()
      return versions.at(-1).settings
    },
  }
}
