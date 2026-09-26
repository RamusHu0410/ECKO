import { useCallback, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { useRecordSession, type SessionPhase } from './useRecordSession'
import { useMode, type Mode } from './useMode'
import { useSongSettings } from './useSongSettings'
import { useHoldToRecord } from './useHoldToRecord'
import { useSongPlayer } from './useSongPlayer'
import { useTalk } from './useTalk'
import { useFaderRemake } from './useFaderRemake'
import { useKeepRecord } from './useKeepRecord'
import type { SongSettings } from './useSongSettings'

/** HUM can start a fresh hum from these; one that already has a song is replaced by the new hum. */
const HUM_FROM: ReadonlySet<SessionPhase> = new Set(['idle', 'mic-error', 'ready', 'failed'])

/**
 * The studio's controls in one place, so the page only draws them: the record session, talk mode,
 * the song settings and playback, and the rules for the microphone and the HUM / TALK keys.
 *
 * Both ways of changing the song end in the same place: a fader through `adjust`, and a spoken
 * command through talk mode, each making the song again from the hum that is already saved.
 *
 * The keys can be switched at any time, except while the mic is live (held, recording or
 * listening). HUM records a fresh hum whenever nothing is being pressed, even over a song that
 * exists. TALK changes the song once there is one. Either waits while ECKO is still answering,
 * so its voice isn't recorded into the next hum.
 */
export function useStudio() {
  const reducedMotion = useReducedMotion() ?? false
  const { settings, update } = useSongSettings()
  const session = useRecordSession(reducedMotion, settings)
  const { mode, setMode } = useMode()
  const talk = useTalk({ settings, update, remakeSong: session.remakeSong })
  const { phase } = session
  const hasSong = phase === 'ready'

  const canHum = !talk.busy && (HUM_FROM.has(phase) || phase === 'recording') // while recording, a tap stops it
  const canTalk = hasSong && !talk.busy
  const pressedMode = useRef<Mode>(mode) // a release always goes back to the mode that started the hold

  const hold = useHoldToRecord({
    enabled: mode === 'talk' ? canTalk : canHum,
    onPress: () => {
      pressedMode.current = mode
      if (mode === 'talk') void talk.listen()
      else if (HUM_FROM.has(phase)) session.record()
    },
    // released before the mic was ready (e.g. during the permission prompt): the recording keeps
    // going and a tap on the mic stops it
    onRelease: () => {
      if (pressedMode.current === 'talk') talk.stop()
      else session.stopRecording()
    },
  })

  const micLive = hold.holding || phase === 'requesting' || phase === 'recording' || talk.phase === 'listening'

  // the song plays while the record turns, and waits while someone talks to it
  const player = useSongPlayer(session.song, hasSong && !session.paused && !talk.busy)

  // every finished song is kept in this browser, so the profile page can list and play it
  useKeepRecord(session.song, settings, hasSong)

  // the faders shape the song that is already playing: each move makes it again from the same hum
  const scheduleRemake = useFaderRemake(settings, session.remakeSong, hasSong)
  const adjust = useCallback(
    (changes: Partial<SongSettings>) => {
      update(changes)
      scheduleRemake()
    },
    [update, scheduleRemake],
  )
  const { paused, tap } = session
  /** Plays the song again from the start, every time; a paused record starts turning again. */
  const replay = () => {
    player.restart()
    if (paused) tap()
  }

  return {
    reducedMotion,
    settings,
    update,
    /** Moves a fader: the setting changes and the song is made again once the fader settles. */
    adjust,
    session,
    talk,
    mode,
    setMode,
    /** The HUM / TALK keys can't change while the mic is live. */
    modeLocked: micLive,
    /** A song exists: it plays, Replay and Re-record show, and TALK can change it. */
    hasSong,
    replay,
    /** Talk mode with a song to talk to: the caption and announcements are talk's. */
    talking: mode === 'talk' && hasSong,
    mic: {
      pointerHandlers: hold.pointerHandlers,
      holding: hold.holding,
      recording: phase === 'recording' || talk.phase === 'listening',
      enabled: mode === 'talk' ? canTalk : canHum || phase === 'requesting',
    },
  }
}
