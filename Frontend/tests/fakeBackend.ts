import type { Page } from '@playwright/test'

/** As long as a real spoken reply: a long caption under the mic once covered the HUM / TALK keys. */
export const TALK_REPLY = "I've made it a little quicker for you, and kept everything else just as it was."

/**
 * Fixed backend replies, so tests need neither the Flask server nor API keys. `calls` counts
 * the requests each route received.
 */
export async function fakeBackend(page: Page) {
  const calls = { upload: 0, song: 0, voice: 0 }
  const settings = {
    emotion: 0.5,
    speed: 0.7,
    pitch: 0.5,
    style: null,
    instruments: [{ name: 'piano', role: 'lead', level: 'normal', section: 'all' }],
    energy: { start: 0, end: 0 },
  }
  // a short phrase with a scoop into the first note and a wobble on the last, so the notes graph
  // has something with real shape to draw
  const notes = [
    { midi: 60, start: 0, duration: 0.45 },
    { midi: 64, start: 0.5, duration: 0.35 },
    { midi: 62, start: 0.9, duration: 0.3 },
    { midi: 67, start: 1.3, duration: 0.7 },
  ]
  const contour = hummedContour(notes)

  await page.route('**/api/upload', (route) => {
    calls.upload++
    return route.fulfill({ status: 201, json: { status: 'success', message: 'saved', filename: 'recording.wav', melody: [] } })
  })
  await page.route('**/api/talk/song', (route) => {
    calls.song++
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: toneWav(4) })
  })
  await page.route('**/api/talk/notes', (route) => {
    // the pitch fader moves the song off the hum, which is what the graph draws in grey
    const asked = route.request().postDataJSON() as { settings?: { pitch?: number } } | null
    const shift = Math.round(((asked?.settings?.pitch ?? 0.5) - 0.5) * 24)
    const played = notes.map((n) => ({ ...n, midi: n.midi + shift }))
    return route.fulfill({ status: 200, json: { sung: notes, played, contour } })
  })
  await page.route('**/api/talk/voice', (route) => {
    calls.voice++
    const turn = { heard: 'make it faster', intent: 'adjust', settings, changed: ['speed'], understood: [], reply: TALK_REPLY, error: null, speech_id: 'reply' }
    return route.fulfill({ status: 200, json: turn })
  })
  await page.route('**/api/talk/speech/*', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: toneWav(0.5) }))
  return calls
}

/** A quiet sine tone as a 16-bit mono WAV file. */
export function toneWav(seconds: number, hz = 220, rate = 16_000): Buffer {
  const samples = Math.floor(seconds * rate)
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + samples * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 6000), 44 + i * 2)
  return wav
}

/**
 * A pitch track shaped like the one the backend sends: one segment per note (a silence between
 * them), each scooping up into its pitch, wobbling a little, and fading at the end.
 */
function hummedContour(notes: { midi: number; start: number; duration: number }[]) {
  const step = 0.0125
  return {
    step,
    segments: notes.map((note) => {
      const frames = Math.round(note.duration / step)
      const midi: number[] = []
      const level: number[] = []
      for (let i = 0; i < frames; i++) {
        const through = i / (frames - 1)
        const scoop = -0.8 * Math.max(0, 1 - through * 6) // slides up into the note
        const wobble = 0.12 * Math.sin(through * Math.PI * 2 * 5.5) // vibrato
        midi.push(Number((note.midi + scoop + wobble).toFixed(2)))
        level.push(Number(Math.min(1, Math.sin(Math.min(1, through * 4) * Math.PI * 0.5) * (1 - through * 0.45)).toFixed(3)))
      }
      return { start: note.start, midi, level }
    }),
  }
}
