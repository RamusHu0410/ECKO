// Hold to talk: press and hold the button (or the space bar) to record, release to send.
// Recording stops by itself after 10 seconds.

export const MAX_TALK_MS = 10_000
const SHORTEST_TALK_MS = 300 // anything shorter was a tap, not a command

export function setUpHoldToTalk(button, { canStart, onStart, onTick, onRecorded, onTooShort, onProblem }) {
  let holding = false
  let stopRecording = null

  async function press() {
    if (holding || !canStart()) return
    holding = true
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      holding = false
      onProblem(error)
      return
    }
    if (!holding) return stopTracks(stream) // let go while the browser was asking for the mic
    const chunks = []
    const recorder = new MediaRecorder(stream)
    const startedAt = performance.now()
    let releasedAt = startedAt
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)
    recorder.onstop = () => {
      stopTracks(stream)
      if (releasedAt - startedAt < SHORTEST_TALK_MS) return onTooShort()
      onRecorded(new Blob(chunks, { type: recorder.mimeType }), releasedAt)
    }
    const timer = setInterval(() => {
      const leftMs = MAX_TALK_MS - (performance.now() - startedAt)
      onTick(Math.max(0, leftMs))
      if (leftMs <= 0) release()
    }, 100)
    stopRecording = () => {
      releasedAt = performance.now()
      clearInterval(timer)
      recorder.stop()
    }
    recorder.start()
    onStart()
  }

  function release() {
    if (!holding) return
    holding = false
    stopRecording?.()
    stopRecording = null
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    button.setPointerCapture(event.pointerId)
    press()
  })
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, release)
  button.addEventListener('click', (event) => event.preventDefault()) // space on the button is handled below

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || isTypingOrOtherButton(event.target, button)) return
    event.preventDefault()
    press()
  })
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' || !holding) return
    event.preventDefault()
    release()
  })
  window.addEventListener('blur', release)
}

function isTypingOrOtherButton(target, holdButton) {
  if (!(target instanceof HTMLElement) || target === holdButton) return false
  return target.closest('input, textarea, select, button, summary, a, audio') !== null
}

function stopTracks(stream) {
  for (const track of stream.getTracks()) track.stop()
}
