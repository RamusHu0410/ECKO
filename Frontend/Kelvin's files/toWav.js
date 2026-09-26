// Browsers record audio as webm (Chrome) or mp4 (Safari), which many tools can't open.
// This turns a recording into a WAV file, which almost anything can read,
// including Python's built-in `wave` module.
export default async function toWav(recording) {
  // decode the recording into raw samples: numbers between -1 and 1
  const context = new AudioContext()
  const audio = await context.decodeAudioData(await recording.arrayBuffer())
  context.close()
  const samples = audio.getChannelData(0) // mono: keep only the first channel

  const dataSize = samples.length * 2 // 2 bytes per sample
  const view = new DataView(new ArrayBuffer(44 + dataSize))
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  // 44-byte header describing the format: uncompressed, mono, 16-bit
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // 1 = uncompressed
  view.setUint16(22, 1, true) // 1 channel
  view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * 2, true) // bytes per second
  view.setUint16(32, 2, true) // bytes per sample
  view.setUint16(34, 16, true) // bits per sample
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)

  // the audio itself, each sample stored as a 16-bit whole number
  samples.forEach((sample, i) => {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true)
  })

  return new Blob([view], { type: 'audio/wav' })
}
