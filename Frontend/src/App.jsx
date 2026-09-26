import { useRef, useState } from 'react'
import toWav from './toWav.js'

export default function App() {
  const [status, setStatus] = useState('idle') // 'idle' | 'starting' | 'recording'
  const recorderRef = useRef(null)

  async function handleClick() {
    if (status === 'recording') {
      recorderRef.current.stop()
      setStatus('idle')
      return
    }

    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const wav = await toWav(new Blob(chunks, { type: recorder.mimeType }))

        // send it to the Flask backend as a form upload, in a field named 'file'
        const form = new FormData()
        form.append('file', wav, 'recording.wav')
        const res = await fetch('/upload', { method: 'POST', body: form })
        console.log(res.status, await res.text()) // the backend's reply, shown in the browser console
      }
      recorder.start()
      recorderRef.current = recorder
      setStatus('recording')
    } catch (err) {
      console.error(err)
      setStatus('idle')
    }
  }

  return (
    <button onClick={handleClick} disabled={status === 'starting'}>
      {status === 'recording' ? 'Stop' : 'Record'}
    </button>
  )
}
