/* Every word the disc says: accessible labels, screen-reader announcements and help messages. */
import type { SessionPhase } from '../../hooks/useRecordSession'
import type { MicProblem } from '../../hooks/useRecorder'
import type { UploadFailureKind } from '../../api/uploadHum'

export function discLabel(phase: SessionPhase, paused: boolean): string {
  switch (phase) {
    case 'idle':
      return 'Start recording. Hum for up to 10 seconds.'
    case 'requesting':
      return 'Waiting for microphone access'
    case 'recording':
      return 'Stop recording'
    case 'pressing':
    case 'waiting':
      return 'Pressing your record'
    case 'ready':
      return paused ? 'Resume the record' : 'Pause the record'
    case 'failed':
      return 'Your record couldn’t be pressed'
    case 'mic-error':
      return 'Try recording again'
  }
}

export const ANNOUNCEMENTS: Partial<Record<SessionPhase, string>> = {
  recording: 'Recording. Hum now.',
  waiting: 'Pressing your record.',
  ready: 'Your record is ready. Tap it to pause.',
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
