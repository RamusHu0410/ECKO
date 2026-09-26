import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Plays one record at a time on a list page. Starting another stops the one before it, pressing
 * the one that's playing pauses it, and a song that reaches its end clears itself.
 *
 * Addresses are made when a record starts playing and thrown away when it stops, so a page full
 * of records doesn't hold an object URL open for every one of them.
 */
export function useRecordPlayer() {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setPlayingId(null)
  }, [])

  useEffect(() => stop, [stop])

  /** Plays `id`, or pauses it if it is the one already playing. `urlFor` is only called on play. */
  const toggle = useCallback(
    (id: string, urlFor: () => string) => {
      if (playingId === id) {
        stop()
        return
      }
      stop()
      const url = urlFor()
      const audio = new Audio(url)
      audio.onended = stop
      audio.onerror = stop
      audioRef.current = audio
      urlRef.current = url
      setPlayingId(id)
      void audio.play().catch(stop) // autoplay refused, or the blob went away
    },
    [playingId, stop],
  )

  return { playingId, toggle, stop }
}
