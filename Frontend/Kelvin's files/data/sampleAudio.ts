/*
 * Stand-in audio for the sample community posts, so their play buttons do something before there
 * is a backend.
 * Each post gets a short phrase built from its own id, rendered to a WAV in the browser.
 *
 * TODO(backend): delete this file once shared posts carry real audio; `Post.audioUrl`
 * (data/community.ts) then holds the address the server serves and nothing else changes.
 */

const RATE = 22_050
export const SECONDS_PER_NOTE = 0.38
/** A pentatonic scale, so any run of notes from it sounds deliberate. */
const SCALE = [0, 3, 5, 7, 10, 12]

/** A short phrase for one feed row, as something an <audio> element can play. */
export function samplePreview(id: string, notes = 6): string {
  const midi = phrase(id, notes)
  return URL.createObjectURL(new Blob([render(midi)], { type: 'audio/wav' }))
}

/** The same id always gives the same phrase, so a row doesn't change tune between plays. */
function phrase(id: string, notes: number): number[] {
  let seed = [...id].reduce((total, letter) => (total * 31 + letter.charCodeAt(0)) >>> 0, 7)
  return Array.from({ length: notes }, () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
    return 60 + SCALE[seed % SCALE.length]
  })
}

/** The phrase as 16-bit mono PCM in a WAV container, each note faded in and out so it doesn't click. */
function render(midi: number[]): ArrayBuffer {
  const perNote = Math.floor(SECONDS_PER_NOTE * RATE)
  const samples = perNote * midi.length
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  writeHeader(view, samples)

  midi.forEach((note, index) => {
    const hz = 440 * 2 ** ((note - 69) / 12)
    for (let i = 0; i < perNote; i++) {
      const through = i / perNote
      const envelope = Math.sin(through * Math.PI) ** 0.6 // in and out, no clicks at the edges
      const wave = Math.sin((2 * Math.PI * hz * i) / RATE) + 0.3 * Math.sin((4 * Math.PI * hz * i) / RATE)
      view.setInt16(44 + (index * perNote + i) * 2, Math.round(wave * envelope * 7000), true)
    }
  })
  return buffer
}

function writeHeader(view: DataView, samples: number): void {
  const text = (at: number, value: string) => [...value].forEach((letter, i) => view.setUint8(at + i, letter.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
}
