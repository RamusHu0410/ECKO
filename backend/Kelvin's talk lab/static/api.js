// Every call the page makes to the talk lab server. Keys never reach the page.

async function readJson(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `The server answered ${response.status}`)
  return data
}

function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(readJson)
}

export function getStatus() {
  return fetch('/api/status').then(readJson)
}

/** A typed command. The current settings go along, because commands are relative. */
export function sendText(text, history) {
  return postJson('/api/command', { text, settings: history.current(), previous: history.previous() })
}

/** A recorded command (webm in Chrome, mp4 in Safari; the server accepts both). */
export function sendVoice(recording, history) {
  const form = new FormData()
  form.append('audio', recording, recordingName(recording.type))
  form.append('state', JSON.stringify({ settings: history.current(), previous: history.previous() }))
  return fetch('/api/voice', { method: 'POST', body: form }).then(readJson)
}

export function makeMusic(settings) {
  return postJson('/api/music', { settings })
}

function recordingName(type) {
  if (type.includes('mp4')) return 'talk.mp4'
  if (type.includes('ogg')) return 'talk.ogg'
  return 'talk.webm'
}
