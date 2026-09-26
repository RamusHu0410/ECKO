/** Sample rate of the WAV files the backend receives. */
const WAV_SAMPLE_RATE = 48_000
const HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 2

/**
 * Browsers record webm (Chrome) or mp4 (Safari). This decodes a recording and re-encodes it
 * as an uncompressed 16-bit mono WAV, which the Flask backend accepts and Python reads natively.
 */
export async function encodeWav(recording: Blob): Promise<Blob> {
  const decoder = new OfflineAudioContext(1, 1, WAV_SAMPLE_RATE)
  const audio = await decoder.decodeAudioData(await recording.arrayBuffer())
  const samples = audio.getChannelData(0) // mono: keep the first channel

  const dataSize = samples.length * BYTES_PER_SAMPLE
  const view = new DataView(new ArrayBuffer(HEADER_BYTES + dataSize))
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  // 44-byte header: uncompressed PCM, 1 channel, 16 bits per sample, little-endian
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * BYTES_PER_SAMPLE, true)
  view.setUint16(32, BYTES_PER_SAMPLE, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)

  // the audio itself: each sample from -1..1 to a 16-bit whole number
  samples.forEach((sample, i) => {
    view.setInt16(HEADER_BYTES + i * BYTES_PER_SAMPLE, Math.max(-1, Math.min(1, sample)) * 0x7fff, true)
  })

  return new Blob([view], { type: 'audio/wav' })
}
