/* Every word the scene says: accessible labels, captions, announcements and help messages. */
import type { SessionPhase } from '../hooks/useRecordSession'
import type { MicProblem } from '../hooks/useRecorder'
import type { UploadFailureKind } from '../api/uploadHum'
import type { GenerateFailureKind } from '../api/generateAccompaniment'
import type { Mode } from '../hooks/useMode'

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

export const MIC_LABEL = 'Microphone. Hold it, or hold the space bar, to hum for up to 10 seconds.'

export function micCaption(phase: SessionPhase, mode: Mode, holding: boolean, secondsLeft: number): string {
  if (mode === 'talk') return 'Talk mode is coming soon. Switch to HUM to hum a tune.'
  if (phase === 'requesting') return 'Allow the microphone'
  if (phase === 'recording') {
    const clock = `0:${String(secondsLeft).padStart(2, '0')}`
    return holding ? `${clock} · release to stop` : `${clock} · tap the mic to stop`
  }
  if (phase === 'idle') return 'Hold to hum'
  return ''
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

/** What went wrong composing the accompaniment, in plain words. Non-blocking: the record still plays, just silently. */
export const ACCOMPANIMENT_HELP: Record<GenerateFailureKind, string> = {
  unreachable: 'The ECKO server isn’t answering, so there’s no sound yet.',
  timeout: 'Composing the song took too long, so there’s no sound yet.',
  unavailable: 'Audio rendering isn’t set up on the server yet, so there’s no sound yet.',
  rejected: 'The server couldn’t compose a song from this hum.',
  server: 'The server ran into a problem composing your song.',
  unexpected: 'Something unexpected happened composing your song.',
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
