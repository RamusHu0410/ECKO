import { useEffect, useState } from 'react'

/**
 * Plays the song on the record, once. A new version starts from the top; `playing` pauses and
 * resumes it (tapping the record, or talking over it), and resuming after the end plays it again.
 */
export function useSongPlayer(song: Blob | null, playing: boolean) {
  const [audio] = useState(() => new Audio())

  useEffect(() => {
    if (!song) return
    const url = URL.createObjectURL(song)
    audio.src = url
    return () => {
      audio.pause()
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [audio, song])

  useEffect(() => {
    if (playing && song) audio.play().catch(() => {}) // a browser may hold sound back until the page is touched
    else audio.pause()
  }, [audio, song, playing])
}
