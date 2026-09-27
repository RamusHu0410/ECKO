import type { Note } from '../api/talk'
import { wavBlob } from './encodeWav'

/*
 * "Pure hum": the notes heard in the hum, played back exactly as transcribed, on one soft tone with
 * nothing added: no chords, no band, no changes to the tune. Made here in the browser from the same
 * notes the graph draws, so it needs nothing from the server.
 */

const SAMPLE_RATE = 44_100
/** A mellow tone: the fundamental with two quiet overtones, like a soft electric piano. */
const OVERTONES = [1, 0.28, 0.08]
const ATTACK_S = 0.012
const RELEASE_S = 0.09
const TAIL_S = 0.4
const PEAK = 0.9

/** The notes as a WAV, starting from the first note (times in seconds, pitches as MIDI, rounded to the note). */
export async function renderPureHum(notes: Note[]): Promise<Blob> {
  const first = Math.min(...notes.map((note) => note.start))
  const end = Math.max(...notes.map((note) => note.start + note.duration)) - first + TAIL_S
  const context = new OfflineAudioContext(1, Math.ceil(end * SAMPLE_RATE), SAMPLE_RATE)
  const level = context.createGain()
  level.gain.value = 0.25
  level.connect(context.destination)

  for (const note of notes) {
    const start = note.start - first
    const stop = start + Math.max(note.duration, ATTACK_S * 4)
    const frequency = 440 * 2 ** ((Math.round(note.midi) - 69) / 12)
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(1, start + ATTACK_S)
    envelope.gain.setTargetAtTime(0.7, start + ATTACK_S, 0.15) // settles a little while it's held
    envelope.gain.setTargetAtTime(0, stop, RELEASE_S / 3) // and fades when it ends
    envelope.connect(level)
    OVERTONES.forEach((loudness, i) => {
      const tone = context.createOscillator()
      tone.frequency.value = frequency * (i + 1)
      const share = context.createGain()
      share.gain.value = loudness
      tone.connect(share).connect(envelope)
      tone.start(start)
      tone.stop(stop + RELEASE_S * 2)
    })
  }

  const samples = (await context.startRendering()).getChannelData(0)
  const loudest = samples.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0)
  if (loudest > 0) samples.forEach((sample, i) => (samples[i] = (sample / loudest) * PEAK))
  return wavBlob(samples, SAMPLE_RATE)
}
