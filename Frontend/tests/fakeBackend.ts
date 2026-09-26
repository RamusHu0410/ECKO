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
  const notes = [
    { midi: 60, start: 0, duration: 0.5 },
    { midi: 64, start: 0.6, duration: 0.5 },
  ]

  await page.route('**/api/upload', (route) => {
    calls.upload++
    return route.fulfill({ status: 201, json: { status: 'success', message: 'saved', filename: 'recording.wav', melody: [] } })
  })
  await page.route('**/api/talk/song', (route) => {
    calls.song++
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: toneWav(4) })
  })
  await page.route('**/api/talk/notes', (route) => route.fulfill({ status: 200, json: { sung: notes, played: notes } }))
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
