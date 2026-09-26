import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Plays the song on the record, once. A new version starts from the top; `playing` pauses and
 * resumes it (tapping the record, or talking over it), and resuming after the end plays it again.
 * restart() plays it from the beginning, as often as it's asked, even mid-song.
 */
export function useSongPlayer(song: Blob | null, playing: boolean) {
  const [audio] = useState(() => new Audio())
  const playingRef = useRef(playing)
  useEffect(() => {
    playingRef.current = playing
  })

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

  /** Back to the start. Plays at once, unless the song is held (paused, or ECKO is talking): then from the start once it's let go. */
  const restart = useCallback(() => {
    audio.currentTime = 0
    if (playingRef.current) audio.play().catch(() => {}) // a song that already ended has stopped, so start it again
  }, [audio])

  return { restart }
}
