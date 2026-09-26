// The test page: wires the hold button, the text box and the history to the talk lab server,
// and shows the settings, the conversation, the versions and how long each stage took.
import { createHistory } from './history.js'
import { getStatus, makeMusic, sendText, sendVoice } from './api.js'
import { MAX_TALK_MS, setUpHoldToTalk } from './holdToTalk.js'

const DIALS = [
  ['emotion', 'Moody', 'Bright'],
  ['speed', 'Slower', 'Faster'],
  ['pitch', 'Lower', 'Higher'],
]
const HOLD_HINT = 'Hold the button or the space bar · up to 10 seconds'

const $ = (id) => document.getElementById(id)
const history = createHistory()
const voice = $('voice')
let busy = false
let timings = {}

// ---------- drawing ----------

function renderSong(changed = []) {
  const settings = history.current()
  $('dials').replaceChildren(
    ...DIALS.map(([name, low, high]) => {
      const row = document.createElement('div')
      row.className = 'dial'
      row.innerHTML = `<div class="dial-ends"><span>${low}</span><span>${high}</span></div>
        <div class="dial-track" role="meter" aria-label="${low} to ${high}" aria-valuemin="0" aria-valuemax="1">
          <div class="dial-fill"></div></div>`
      row.querySelector('.dial-track').setAttribute('aria-valuenow', settings[name])
      row.querySelector('.dial-fill').style.width = `${settings[name] * 100}%`
      if (changed.includes(name)) flash(row)
      return row
    }),
  )
  $('style').textContent = settings.style ?? 'none yet'
  $('extras').textContent = settings.extras.length ? settings.extras.join(', ') : 'none'
  renderVersions()
}

function renderVersions() {
  const versions = history.all()
  $('versions').replaceChildren(
    ...versions.map((version, index) => {
      const item = document.createElement('li')
      item.textContent = `v${index + 1} · ${version.label}`
      item.classList.toggle('current', index === versions.length - 1)
      return item
    }),
  )
  $('undo').disabled = !history.canUndo()
}

function renderTimings() {
  const rows = [
    ['Speech to text (ElevenLabs)', timings.transcribe_ms],
    ['Understanding (Gemini)', timings.understand_ms],
    ['Server total', timings.total_ms],
    ['Round trip from the page', timings.round_trip_ms],
    ['Reply received → voice starts', timings.voice_start_ms],
    ['You finish → voice starts', timings.to_voice_ms],
    ['Song engine request', timings.music_ms],
  ]
  $('timings').replaceChildren(
    ...rows.map(([label, ms]) => {
      const row = document.createElement('tr')
      row.innerHTML = '<td></td><td></td>'
      row.cells[0].textContent = label
      row.cells[1].textContent = ms === undefined ? '—' : `${Math.round(ms)} ms`
      return row
    }),
  )
}

function addToLog(who, text, tag) {
  const item = document.createElement('li')
  item.innerHTML = '<span class="who"></span><span class="said"></span>'
  item.querySelector('.who').textContent = who
  item.querySelector('.said').textContent = text
  if (who === 'Problem') item.classList.add('error')
  if (tag) {
    const badge = document.createElement('span')
    badge.className = 'tag'
    badge.textContent = tag
    item.append(badge)
  }
  $('log').prepend(item)
}

function flash(element) {
  element.classList.add('changed')
  setTimeout(() => element.classList.remove('changed'), 50)
}

function setBusy(value) {
  busy = value
  $('hold').disabled = value
  $('send').disabled = value
  $('hold').textContent = value ? 'Thinking…' : 'Hold to talk'
}

// ---------- one talk turn ----------

/** Sends a command, applies the answer, then plays the spoken reply as it streams in. */
async function runTurn(send, finishedAt) {
  setBusy(true)
  timings = {}
  try {
    const turn = await send()
    const answeredAt = performance.now()
    timings = { ...turn.timings, round_trip_ms: answeredAt - finishedAt }
    applyTurn(turn)
    renderTimings()
    setBusy(false)
    const voiceStartedAt = await playReply(turn.speech_url)
    if (voiceStartedAt) {
      timings.voice_start_ms = voiceStartedAt - answeredAt
      timings.to_voice_ms = voiceStartedAt - finishedAt
      renderTimings()
    }
  } catch (error) {
    addToLog('Problem', error.message)
    setBusy(false)
  }
}

function applyTurn(turn) {
  // newest first, so within a turn the last line added ("You") ends up on top
  if (turn.error) addToLog('Problem', turn.error)
  addToLog('ECKO', turn.reply, turn.intent)
  if (turn.heard) addToLog('You', turn.heard)
  if (turn.intent === 'undo' && history.canUndo()) history.undo()
  else if (turn.changed.length) history.push(turn.settings, turn.heard)
  renderSong(turn.changed)
  if (turn.changed.length) refreshMusic()
}

/** Resolves with the moment the voice became audible, or null if it couldn't play. */
function playReply(url) {
  return new Promise((resolve) => {
    const done = (ok) => {
      voice.onplaying = voice.onerror = null
      resolve(ok ? performance.now() : null)
    }
    voice.onplaying = () => done(true)
    voice.onerror = () => {
      addToLog('Problem', 'The voice reply could not play. Check the ElevenLabs key and the server log.')
      done(false)
    }
    voice.src = url
    voice.play().catch(() => done(false)) // blocked autoplay: the player's own play button still works
  })
}

async function refreshMusic() {
  const started = performance.now()
  try {
    const song = await makeMusic(history.current())
    timings.music_ms = performance.now() - started
    renderTimings()
    const { melody, ...rest } = song.request
    $('music-request').textContent = JSON.stringify({ ...rest, melody: `${melody.length} notes (demo tune)` }, null, 2)
    $('music-note').textContent =
      song.error ??
      (song.mode === 'mock'
        ? `Mock mode: ${rest.style}, ${rest.tempo} BPM, ${rest.mode ?? 'mode from the melody'}. Nothing was sent.`
        : 'Made by the main backend.')
    $('song').hidden = !song.audio_url
    if (song.audio_url) $('song').src = song.audio_url
  } catch (error) {
    $('music-note').textContent = error.message
  }
}

// ---------- inputs ----------

setUpHoldToTalk($('hold'), {
  canStart: () => !busy,
  onStart() {
    voice.pause()
    $('hold').classList.add('recording')
    $('hold-caption').textContent = '0:10 · release to send'
  },
  onTick(leftMs) {
    $('hold-caption').textContent = `0:${String(Math.ceil(leftMs / 1000)).padStart(2, '0')} · release to send`
  },
  onRecorded(recording, finishedAt) {
    $('hold').classList.remove('recording')
    $('hold-caption').textContent = HOLD_HINT
    runTurn(() => sendVoice(recording, history), finishedAt)
  },
  onTooShort() {
    $('hold').classList.remove('recording')
    $('hold-caption').textContent = `Keep holding while you talk (up to ${MAX_TALK_MS / 1000} seconds).`
  },
  onProblem(error) {
    $('hold-caption').textContent = `The microphone didn't start: ${error.message}`
  },
})

function sendTyped(text) {
  if (busy) return
  voice.pause()
  runTurn(() => sendText(text, history), performance.now())
}

$('type-form').addEventListener('submit', (event) => {
  event.preventDefault()
  sendTyped($('text').value)
  $('text').value = ''
})

for (const chip of document.querySelectorAll('[data-example]')) {
  chip.addEventListener('click', () => sendTyped(chip.textContent))
}

$('undo').addEventListener('click', () => {
  const before = history.current()
  const after = history.undo()
  renderSong(DIALS.map(([name]) => name).filter((name) => before[name] !== after[name]))
  addToLog('You', 'Undo (button, no voice)')
  refreshMusic()
})

// ---------- start ----------

renderSong()
renderTimings()
getStatus()
  .then((status) => {
    $('status').textContent =
      `Gemini ${status.gemini_model} (${status.gemini_thinking} thinking) · voice ${status.tts_model} · ` +
      `ears ${status.stt_model} · song engine: ${status.music_mode}`
    const missing = Object.entries(status.keys_present).filter(([, present]) => !present)
    $('key-warning').hidden = missing.length === 0
    $('key-warning').textContent = `Missing from .env: ${missing.map(([name]) => `the ${name} key`).join(' and ')}. Add ${missing.length > 1 ? 'them' : 'it'}, then restart the server.`
  })
  .catch(() => ($('status').textContent = 'The talk lab server is not answering.'))
