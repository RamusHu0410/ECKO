import { useCallback } from 'react'
import { useReducedMotion } from 'motion/react'
import { useRecordSession, type SessionPhase } from './useRecordSession'
import { useSongSettings } from './useSongSettings'
import { useHoldToRecord } from './useHoldToRecord'
import { useSongPlayer } from './useSongPlayer'
import { useTalk } from './useTalk'
import { useFaderRemake } from './useFaderRemake'
import { useKeepRecord } from './useKeepRecord'
import type { SongSettings } from './useSongSettings'

/** The mic can start a fresh hum from these; one that already has a song is replaced by the new hum. */
const HUM_FROM: ReadonlySet<SessionPhase> = new Set(['idle', 'mic-error', 'ready', 'failed'])

/**
 * The studio's controls in one place, so the page only draws them: the record session, talk,
 * the song settings and playback, and the rules for the microphone and the gnome.
 *
 * Both ways of changing the song end in the same place: a fader through `adjust`, and a spoken
 * command through talk, each making the song again from the hum that is already saved.
 *
 * The microphone always records a hum, even over a song that exists. Talking is holding the gnome,
 * who only shows up once there's a song to change. Neither starts while ECKO is still answering,
 * so its voice isn't recorded into the next hum, and neither starts while the other is live.
 */
export function useStudio() {
  const reducedMotion = useReducedMotion() ?? false
  const { settings, update } = useSongSettings()
  const session = useRecordSession(reducedMotion, settings)
  const talk = useTalk({ settings, update, remakeSong: session.remakeSong })
  const { phase } = session
  const hasSong = phase === 'ready'

  const canHum = !talk.busy && (HUM_FROM.has(phase) || phase === 'recording') // while recording, a tap stops it

  const hold = useHoldToRecord({
    enabled: canHum,
    onPress: () => {
      if (HUM_FROM.has(phase)) session.record()
    },
    // released before the mic was ready (e.g. during the permission prompt): the recording keeps
    // going and a tap on the mic stops it
    onRelease: () => session.stopRecording(),
  })

  const canTalk = hasSong && !talk.busy && !hold.holding
  const talkHold = useHoldToRecord({
    enabled: canTalk,
    keys: 'focused',
    onPress: () => void talk.listen(),
    onRelease: () => talk.stop(),
  })

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
    /** A song exists: it plays, Replay and Re-record show, and the gnome is there to talk to. */
    hasSong,
    replay,
    /** Something was said to the gnome about this song: the caption and announcements are talk's. */
    talking: hasSong && (talk.busy || talk.reply !== '' || talk.problem !== null),
    mic: {
      pointerHandlers: hold.pointerHandlers,
      holding: hold.holding,
      recording: phase === 'recording',
      enabled: canHum || phase === 'requesting',
    },
    /** The gnome on the sound box: press and hold it to talk. */
    gnome: {
      present: hasSong,
      enabled: canTalk,
      holding: talkHold.holding,
      phase: talk.phase,
      press: talkHold.press,
      release: talkHold.release,
      /** For its keyboard button on the page: hold Space or Enter on it. */
      keyHandlers: talkHold.pointerHandlers,
    },
  }
}
