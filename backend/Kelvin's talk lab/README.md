# Kelvin's talk lab

> **Merged.** Talk mode now runs inside the real website: the backend's `src/app/talk/` package and `src/app/routes/talk.py` blueprint, and the frontend's `hooks/useTalk.ts`. This folder stays as a reference and test bench with its own `.venv`, `.env` and live tests; the website doesn't need it.

A stand-alone prototype of ECKO's **talk mode**. After a song is made, you change it by voice or by typing ("turn this into rock", "make it faster and lighter"). The lab understands the command with Gemini, updates the song settings, and a warm voice (ElevenLabs) answers.

It runs on its own. It is **not** registered with the main Flask app and touches no backend or frontend files, so it can be tested safely and merged later.

## Setup (once)

```bash
cd "backend/Kelvin's talk lab"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # then paste your two keys into .env
```

`.env` is gitignored. Keys live only there and are only read by the Python server. The page never sees them.

## Run

```bash
.venv/bin/python server.py
```

Open http://localhost:5190. It uses port 5190, so it doesn't clash with the main frontend (5173) or the backend (8000).

- **Hold to talk**: hold the orange button, or the space bar, while you speak (10 seconds max). Let go to send. A quick tap is ignored.
- **Type**: use the text box or one of the example chips (they include tricky ones: off-topic, gibberish, an injection attempt).
- **Your song** shows the three sliders from the main app's "Your song" panel (Moody↔Bright, Slower↔Faster, Lower↔Higher) plus style and extras.
- **Versions** lists every change. **Undo** steps back without talking. Saying "undo that" works too.
- **Timings, last turn** shows how long each stage took.

## Tests

```bash
.venv/bin/python -m pytest -m "not live"   # 72 offline tests, no keys, no network, under 1 second
.venv/bin/python -m pytest                 # all 100, including 28 that call the real APIs (about 2 minutes)
```

Live tests skip themselves when a key is missing from `.env`. They pause about 4 seconds between Gemini calls, because the free tier allows only 15 requests a minute.

No microphone is needed. `tests/fixtures/` holds spoken recordings (WAV and M4A, one in Spanish, plus silence) made with the Mac's built-in voice by `scripts/make_fixtures.py`.

Latency, with the real services:

```bash
.venv/bin/python scripts/measure_latency.py --rounds 5
```

## How a turn works

```
hold & talk ──► POST /api/voice (recording + current settings + previous version)
                   │  speech to text (ElevenLabs scribe_v2)
                   │  understand (Gemini, JSON schema only)
                   │  new settings = our own arithmetic, clamped 0–1
                   ◄── { heard, intent, settings, changed, reply, timings, speech_url }
page plays speech_url ──► GET /api/speech/<id>  (ElevenLabs streams MP3; playback starts on the first chunk)
page, if something changed ──► POST /api/music  (mock by default: shows the request the song engine would get)
```

- **Commands are relative.** The page sends the current settings with every command, so "a bit faster" means faster than now. The server keeps no session state.
- **Gemini never sets numbers.** It answers only in a fixed JSON shape: which setting, which way (up, down or reset) and how much (slight 0.10, moderate 0.20, strong 0.35, or max). `talk/settings.py` does the arithmetic and clamps it to 0–1.
- **Safety:** the listener's words sit inside a fence and are treated as words, not instructions. Off-topic, unclear and injection attempts can never change settings (the code enforces this, not only the prompt). The reply is capped at 220 characters. The browser only gets a reply *id* for speech, so the server can't be used to speak arbitrary text.
- **Nothing crashes the turn.** If Gemini or ElevenLabs fails, times out (10 s) or a key is missing, the settings stay the same and the voice says a friendly line from `talk/phrases.py`.
- **Music is mocked by default.** Set `MUSIC_MODE=backend` in `.env` to really call the main backend's `POST /accompaniment/generate` (the backend must be running, and WAV needs FluidSynth).

## Models (checked against the official docs, September 2026)

| Job | Model | Why |
|---|---|---|
| Speech to text | ElevenLabs `scribe_v2` | current batch model (`scribe_v1` is deprecated) |
| Understanding | Gemini `gemini-3.1-flash-lite`, thinking `minimal` | the most reliable fast model on our key (see below) |
| Voice | ElevenLabs `eleven_flash_v2_5`, voice `JBFqnCBsd6RMkjVDRZzb` | lowest-latency TTS, 32 languages (`turbo` models are deprecated) |

All of these can be changed in `.env` without touching code.

## Measured results (26 Sept 2026, free-tier Gemini key, from this Mac)

| Stage | median | fastest | slowest |
|---|---|---|---|
| Speech to text | 476 ms | 285 ms | 705 ms |
| Understanding (Gemini) | 914 ms | 596 ms | 2352 ms |
| Voice: first audio | 208 ms | 189 ms | 234 ms |
| **You stop talking → first audio of the reply** (server side) | **1.64 s** | 1.41 s | 5.95 s |

In the browser, add about 0.4 s for the audio element to start playing. A full hold-to-talk turn in headless Chrome measured 2.9 s from letting go to hearing the voice.

## What didn't work / known limits

- **`gemini-3.5-flash-lite` (the docs' "fastest") was unreliable on our free-tier key:** 8 of 15 calls failed with `504 DEADLINE_EXCEEDED`. `gemini-3.5-flash` answered `503 high demand` and `gemini-3.8-flash` took about 6 s. `gemini-3.1-flash-lite` answered 12 of 12 correctly, so it is the default.
- **Free tier = 15 Gemini requests a minute.** Fine for one tester, not for a demo room. A paid key is needed before real users try it.
- **Occasional slow Gemini answers** (up to about 6 s end to end). There is no fallback model yet; the 10-second timeout turns anything slower into "Could you say that again?".
- The replies sometimes still sound a bit formal ("I have…") despite the prompt asking for contractions.
- The song engine only knows 4 styles (piano, pop, cinematic, classical), so genres like rock or jazz are mapped to the closest one in `talk/music.py`. Extras (drums, strings…) aren't used by the engine yet.
- The mock music request uses a short demo tune, not the user's hum.
- Checked in Chrome only. Safari records M4A, which the server accepts (tested with the M4A fixtures), but Safari's autoplay rules may need a tap on the reply's play button.

## Merging into the main backend (Flask) — Kingsley's call

1. Copy the `talk/` folder to `backend/src/app/talk/`. It has no Flask imports, so nothing inside it needs to change.
2. Add the two new dependencies from `backend/`: `uv add elevenlabs google-genai`. Flask, pydantic and python-dotenv are already there.
3. Make `backend/src/app/routes/talk.py` a Blueprint with the routes from `server.py` (`/talk/command`, `/talk/voice`, `/talk/speech/<id>`, and the music ones if wanted). Build the services once with `build_services(load_config())` and register the blueprint in `create_app`.
4. Put the keys in the backend's `.env` (never in the frontend).
5. In `talk/music.py`, call `generate_accompaniment(...)` directly instead of over HTTP, and pass the melody from the user's hum instead of `DEMO_MELODY`.
6. Copy the offline tests. They only need the fakes in `tests/conftest.py`.

## Merging into the main frontend (`Frontend/Kelvin's files/`)

1. `hooks/useSongSettings.ts`: add `style: string | null` and `extras: string[]` next to emotion, speed and pitch. The numbers already match (0–1, 0.5 in the middle).
2. New `api/talk.ts`: port `static/api.js`. With the Vite proxy, call `/api/talk/voice`. The proxy strips `/api`, so put it back in front of `speech_url` before playing it.
3. New `hooks/useTalk.ts`: port `static/history.js` (versions and undo) plus `runTurn`/`applyTurn` from `static/app.js`.
4. `pages/HomePage.tsx` already has the spot: `TODO(talk)` in the hold-to-record handler. In talk mode, record with the existing `useRecorder` (its WAV is accepted), send it on release, play the reply with an `Audio` element, and call `update(turn.settings)`.

## Folder map

```
Kelvin's talk lab/
├── README.md                  this file
├── requirements.txt           the lab's own Python dependencies
├── pytest.ini                 test settings and the "live" marker
├── .env.example               every setting with its default; copy to .env
├── .env                       your keys (gitignored)
├── .gitignore                 keeps .env, .venv and caches out of git
├── server.py                  Flask web layer: the page plus 6 API routes (the only file that knows Flask)
├── talk/
│   ├── __init__.py            package note: framework-free talk-mode core
│   ├── config.py              reads .env into a Config (model names, keys, music mode, port)
│   ├── commands.py            the JSON shape Gemini must answer in (Command, Adjustment)
│   ├── settings.py            SongSettings and the arithmetic that moves the sliders
│   ├── intent.py              the Gemini call: system prompt, fenced user words, schema
│   ├── stt.py                 ElevenLabs speech to text
│   ├── tts.py                 ElevenLabs streaming text to speech
│   ├── pipeline.py            one talk turn with timings; never raises
│   ├── phrases.py             every fixed sentence the voice can say
│   ├── music.py               settings → song engine request; mock or real backend call
│   ├── store.py               keeps replies and songs by id for 5 minutes
│   └── services.py            builds the real services from .env; clear errors for missing keys
├── static/
│   ├── index.html             the test page
│   ├── style.css              its styles (light and dark)
│   ├── app.js                 wires the page together and draws it
│   ├── api.js                 every call the page makes to the server
│   ├── history.js             versions and undo, no page code
│   └── holdToTalk.js          hold the button or space bar to record, 10 s max
├── tests/
│   ├── conftest.py            fake Gemini/ElevenLabs/song engine and key checks
│   ├── test_settings.py       slider arithmetic, labels, limits, input checks
│   ├── test_intent.py         what Gemini is sent and how answers are read
│   ├── test_pipeline.py       whole turns with fakes: undo, limits, failures, silence
│   ├── test_server.py         the web routes through Flask's test client
│   ├── test_music.py          settings → song engine request, mock vs backend
│   ├── test_store.py          expiry and size limit of the short-term store
│   ├── test_live_gemini.py    20 real commands, tricky ones included (live)
│   ├── test_live_speech.py    real speech to text on fixtures, voice streaming, a full voice turn (live)
│   └── fixtures/              spoken test recordings (WAV, M4A, Spanish, silence)
└── scripts/
    ├── make_fixtures.py       regenerates the recordings with the Mac's built-in voices
    └── measure_latency.py     times each stage with the real services
```
