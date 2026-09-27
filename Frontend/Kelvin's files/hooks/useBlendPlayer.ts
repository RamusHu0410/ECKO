import { useCallback, useEffect, useRef } from 'react'

/** How long a volume takes to follow the slider, in seconds: quick, but without clicks. */
const GLIDE_SECONDS = 0.03
/** Starting a moment ahead lets every version begin on exactly the same sample. */
const START_AHEAD_SECONDS = 0.05

/**
 * Plays the song on the record: one version, or several at once in step, each at its own volume
 * (`volumes[i]` from 0 to 1, e.g. the sound slider's blend). New versions start from the top;
 * `playing` pauses and resumes them (tapping the record, or talking over it), and resuming after
 * the end plays them again. restart() plays them from the beginning, as often as it's asked.
 *
 * Web Audio rather than <audio> elements: several elements drift a few milliseconds apart, which
 * you hear as an echo. Here all versions start on the same clock and stay together to the end.
 */
export function useBlendPlayer(songs: Blob[] | null, volumes: number[], playing: boolean) {
  const context = useRef<AudioContext | null>(null)
  const buffers = useRef<AudioBuffer[]>([])
  const gains = useRef<GainNode[]>([])
  const sources = useRef<AudioBufferSourceNode[]>([])
  const ended = useRef(false)
  const volumesRef = useRef(volumes)
  useEffect(() => {
    volumesRef.current = volumes
  })

  useEffect(() => {
    const created = new AudioContext()
    context.current = created
    return () => {
      context.current = null
      void created.close()
    }
  }, [])

  const stop = useCallback(() => {
    for (const source of sources.current) {
      source.onended = null
      source.stop()
    }
    sources.current = []
  }, [])

  /** Every version from the top. While the song is held they wait, and start once it's let go. */
  const restart = useCallback(() => {
    const ctx = context.current
    if (!ctx || buffers.current.length === 0) return
    stop()
    const at = ctx.currentTime + START_AHEAD_SECONDS
    sources.current = buffers.current.map((buffer, i) => {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gains.current[i])
      source.start(at)
      return source
    })
    ended.current = false
    const longest = sources.current.reduce((a, b) => (b.buffer!.duration > a.buffer!.duration ? b : a))
    longest.onended = () => {
      ended.current = true
    }
  }, [stop])

  // new versions: decode them, give each its own volume control, then play from the top
  useEffect(() => {
    stop()
    buffers.current = []
    const ctx = context.current
    if (!songs || !ctx) return
    let current = true
    Promise.all(songs.map(async (song) => ctx.decodeAudioData(await song.arrayBuffer())))
      .then((decoded) => {
        if (!current) return
        for (const gain of gains.current) gain.disconnect()
        gains.current = decoded.map((_, i) => {
          const gain = ctx.createGain()
          gain.gain.value = volumesRef.current[i] ?? 0
          gain.connect(ctx.destination)
          return gain
        })
        buffers.current = decoded
        restart()
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.warn('[ECKO player] the song could not be decoded:', error)
      })
    return () => {
      current = false
    }
  }, [songs, stop, restart])

  // pause and resume; resuming after the end plays it again
  useEffect(() => {
    const ctx = context.current
    if (!ctx) return
    if (playing) {
      if (ended.current) restart()
      void ctx.resume() // a browser may hold sound back until the page is touched
    } else {
      void ctx.suspend()
    }
  }, [playing, restart])

  // each version's volume glides to its new share
  const volumeKey = volumes.join()
  useEffect(() => {
    const ctx = context.current
    if (!ctx) return
    gains.current.forEach((gain, i) => gain.gain.setTargetAtTime(volumesRef.current[i] ?? 0, ctx.currentTime, GLIDE_SECONDS))
  }, [volumeKey])

  return { restart }
}
