/* Every word the scene says: accessible labels, captions, announcements and help messages. */
import type { SessionPhase } from '../hooks/useRecordSession'
import type { MicProblem } from '../hooks/useRecorder'
import type { UploadFailureKind } from '../api/uploadHum'
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

export const MIC_LABEL = 'Microphone. Hold it, or hold the space bar, to hum for up to 10 seconds.'

/** The gnome's keyboard button (the gnome itself is in the 3D scene, which screen readers skip). */
export const GNOME_LABEL = 'The gnome. Hold it, or hold Space or Enter, and say how to change the song.'

/** Under the mic, except once something has been said to the gnome (see talkCaption). */
export function micCaption(phase: SessionPhase, holding: boolean, secondsLeft: number, answering: boolean): string {
  if (phase === 'requesting') return 'Allow the microphone'
  if (phase === 'recording') {
    return holding ? `${clock(secondsLeft)} · release to stop` : `${clock(secondsLeft)} · tap the mic to stop`
  }
  if (answering) return 'One moment, ECKO is still answering…'
  if (phase === 'idle') return 'Hold to hum'
  if (phase === 'ready') return 'Hold the gnome to change your song, or the mic to hum a new tune'
  if (phase === 'failed') return 'Hold to hum a new tune'
  return ''
}

/** Under the mic once something has been said to the gnome about the song. */
export function talkCaption(phase: TalkPhase, reply: string, problem: TalkProblem | null, secondsLeft: number): string {
  if (phase === 'listening') return `${clock(secondsLeft)} · release when you're done`
  if (phase === 'thinking') return 'Thinking…'
  if (phase === 'remaking') return 'Pressing the new version…'
  if (problem === 'voice' && reply) return `${reply} (${TALK_PROBLEMS.voice})`
  if (problem) return TALK_PROBLEMS[problem]
  return reply || 'Hold the gnome and talk. Try “make it faster”.'
}

const TALK_PROBLEMS: Record<TalkProblem, string> = {
  mic: 'The microphone didn’t start. Allow it, then try again.',
  short: 'Keep holding while you talk.',
  failed: 'That didn’t reach ECKO. Try again in a moment.',
  service: 'ECKO couldn’t hear you: its speech service isn’t set up on the server.',
  voice: 'ECKO couldn’t say it out loud: its voice isn’t set up on the server.',
  song: 'The new version couldn’t be made. Your song is unchanged.',
}

function clock(secondsLeft: number): string {
  return `0:${String(secondsLeft).padStart(2, '0')}`
}

export const ANNOUNCEMENTS: Partial<Record<SessionPhase, string>> = {
  recording: 'Recording. Hum now.',
  waiting: 'Pressing your record.',
  ready: 'Your record is playing. Tap it to pause. A gnome is on the turntable: hold it to talk and change the song.',
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
  'too-short': {
    title: 'That was too short',
    body: 'Hold the mic, or the space bar, and hum for at least a second.',
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

/**
 * The guided tour: a glass note with an arrow at each part of the studio, one step at a time
 * (components/Tour). `target` is what it points at: a CSS selector, mostly [data-tour] marks.
 * Part one plays the first time the studio comes into view; part two the first time a song is ready.
 */
export const TOUR = {
  beforeSong: [
    {
      target: '[data-tour="turntable"]',
      title: 'Your record',
      body: 'This is where your song is made. Your hum fills the glass disc, then it’s pressed into vinyl while ECKO turns it into a song.',
    },
    {
      target: '[data-tour="mic"]',
      title: 'Hum here',
      body: 'Hold the microphone, or the space bar, and hum for up to ten seconds; let go when you’re done. Once your song is ready, I’ll show you around the rest.',
    },
  ],
  afterSong: [
    {
      target: '[data-tour="turntable"]',
      title: 'Your song is playing',
      body: 'The record plays the song made from your hum. Tap the record to pause it, and tap again to play.',
    },
    {
      target: '[data-tour="turntable"]',
      title: 'Talk to the gnome',
      body: 'Press and hold the gnome on the record, say what you’d like, and let go: “make it faster”, “add violin behind the piano”, “turn it into jazz”. He answers out loud and changes the song. Say “undo” to go back.',
    },
    {
      target: '[data-tour="gnome-picker"]',
      title: 'Pick your gnome',
      body: 'ECKO, grumpy Grandpa, Hype or Spooky: each has his own voice, his own way of talking and his own look.',
    },
    {
      target: '[data-tour="song-buttons"]',
      title: 'Replay or start again',
      body: 'Replay plays your song from the top. Re-record clears it so you can hum a new tune.',
    },
    {
      target: '[data-tour="faders"]',
      title: 'Shape your song',
      body: 'Emotion runs from moody to bright; Speed and Pitch do what they say. Move one and let go, and the song is made again to match.',
    },
    {
      target: '[data-tour="advanced"]',
      title: 'Blend the sound',
      body: 'Open Advanced and slide Sound from classical piano, through synth, to creepy. Let go anywhere: in between, the two sounds blend.',
    },
    {
      target: '[data-tour="reset"]',
      title: 'Start fresh',
      body: 'Reset puts Emotion, Speed, Pitch and Sound back in the middle.',
    },
    {
      target: '[data-tour="graph"]',
      title: 'See your tune',
      body: 'Amber is the tune as you hummed it; grey is what the song plays.',
    },
    {
      target: 'nav[aria-label="Pages"]',
      title: 'Keep and share',
      body: 'Every song you make is kept on your Profile. Community is where people share theirs.',
    },
  ],
  back: 'Back',
  next: 'Next',
  done: 'Done',
  skip: 'Skip',
  reopen: 'How to use ECKO',
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
