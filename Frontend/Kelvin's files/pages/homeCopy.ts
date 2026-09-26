/* Every word the scene says: accessible labels, captions, announcements and help messages. */
import type { SessionPhase } from '../hooks/useRecordSession'
import type { MicProblem } from '../hooks/useRecorder'
import type { UploadFailureKind } from '../api/uploadHum'
import type { Mode } from '../hooks/useMode'
import type { TalkPhase, TalkProblem } from '../hooks/useTalk'

export function discLabel(phase: SessionPhase, paused: boolean): string {
  switch (phase) {
    case 'ready':
      return paused ? 'Resume the record' : 'Pause the record'
    case 'recording':
      return 'The disc is filling with your hum'
    case 'pressing':
    case 'waiting':
      return 'Pressing your record'
    default:
      return 'Turntable with an empty glass disc'
  }
}

export function micLabel(mode: Mode): string {
  return mode === 'talk'
    ? 'Microphone. Hold it, or hold the space bar, and say how to change the song.'
    : 'Microphone. Hold it, or hold the space bar, to hum for up to 10 seconds.'
}

/** Under the mic, except in talk mode once there's a song to change (see talkCaption). */
export function micCaption(phase: SessionPhase, mode: Mode, holding: boolean, secondsLeft: number, answering: boolean): string {
  if (phase === 'requesting') return 'Allow the microphone'
  if (phase === 'recording') {
    return holding ? `${clock(secondsLeft)} · release to stop` : `${clock(secondsLeft)} · tap the mic to stop`
  }
  if (mode === 'talk') return phase === 'idle' ? 'Hum a tune first, then talk to change it.' : ''
  if (answering) return 'One moment, ECKO is still answering…'
  if (phase === 'idle') return 'Hold to hum'
  if (phase === 'ready' || phase === 'failed') return 'Hold to hum a new tune'
  return ''
}

/** Under the mic in talk mode, once there's a song to change. */
export function talkCaption(phase: TalkPhase, reply: string, problem: TalkProblem | null, secondsLeft: number): string {
  if (phase === 'listening') return `${clock(secondsLeft)} · release when you're done`
  if (phase === 'thinking') return 'Thinking…'
  if (phase === 'remaking') return 'Pressing the new version…'
  if (problem) return TALK_PROBLEMS[problem]
  return reply || 'Hold to talk. Try “make it faster”.'
}

const TALK_PROBLEMS: Record<TalkProblem, string> = {
  mic: 'The microphone didn’t start. Allow it, then try again.',
  short: 'Keep holding while you talk.',
  failed: 'That didn’t reach ECKO. Try again in a moment.',
  song: 'The new version couldn’t be made. Your song is unchanged.',
}

function clock(secondsLeft: number): string {
  return `0:${String(secondsLeft).padStart(2, '0')}`
}

export const ANNOUNCEMENTS: Partial<Record<SessionPhase, string>> = {
  recording: 'Recording. Hum now.',
  waiting: 'Pressing your record.',
  ready: 'Your record is playing. Tap it to pause.',
}

export const MIC_HELP: Record<MicProblem, { title: string; body: string }> = {
  blocked: {
    title: 'Your microphone is turned off for this page',
    body: 'Allow it from the icon at the left of the address bar (on iPhone: Settings › Safari › Microphone), then try again.',
  },
  'no-microphone': {
    title: 'No microphone found',
    body: 'Plug in a microphone or headset, or check your sound settings, then try again.',
  },
  insecure: {
    title: 'The microphone needs a secure page',
    body: 'Open this page with an https:// address (or on localhost), then try again.',
  },
  unsupported: {
    title: 'This browser can’t record audio',
    body: 'Open the page in the latest Chrome or Safari and try again.',
  },
  unavailable: {
    title: 'The microphone didn’t start',
    body: 'Another app may be using it. Close that app, then try again.',
  },
}

export const UPLOAD_FAILED_TITLE = 'We couldn’t press your record'

/** What went wrong, in plain words. showDetail adds the technical detail in small print. */
export const UPLOAD_HELP: Record<UploadFailureKind, { body: string; showDetail: boolean }> = {
  conversion: { body: 'This browser couldn’t prepare your recording. Try recording again.', showDetail: true },
  unreachable: { body: 'The ECKO server isn’t answering. Make sure it’s running, then try again.', showDetail: false },
  timeout: { body: 'The server took too long to answer. Try again in a moment.', showDetail: false },
  'too-large': { body: 'That recording is too large to send. Try a shorter hum.', showDetail: false },
  rejected: { body: 'The server didn’t accept your recording.', showDetail: true },
  server: { body: 'The server ran into a problem with your recording.', showDetail: true },
  unexpected: { body: 'Something unexpected came back from the server.', showDetail: true },
}

/** The intro at the top of the page: what ECKO is, and its three steps as the tracks on side A. */
export const INTRO = {
  /** Set on two lines. */
  title: ['Hum a tune.', 'Get a song.'],
  lede: 'ECKO turns a few seconds of humming into a finished song and presses it onto a record. Then you talk to it to change how it sounds.',
  side: 'Side A · How it works',
  tracks: [
    { title: 'Hum into the mic', body: 'Hold the microphone and hum for up to ten seconds. Any tune in your head will do.' },
    { title: 'We press it into a record', body: 'Your hum becomes a song and is pressed onto vinyl while you watch.' },
    { title: 'Talk to change it', body: 'Say what you’d like: “add strings behind the piano”, or “make the ending bigger”.' },
  ],
  start: 'Hum your first tune',
  scroll: 'Scroll to the studio',
}
