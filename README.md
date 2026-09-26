# ECKO

Hum a tune, get a song. ECKO turns a short vocal melody into a fully
arranged musical accompaniment, lets you reshape it with your voice, and
share the results in a small social hub.

## What it does

- **Hum to music** — record a hum (up to ~10s) in the browser. The backend
  detects the notes and timing, then generates an accompaniment in your
  chosen style (`piano`, `pop`, `cinematic`, `classical`).
- **Talk to change it** — once you have a song, hold the mic and say things
  like "make it faster" to remake it.
- **Save & share** — sign in (via Auth0), save recordings, and post them to a
  discussion hub with comments and likes.

## Architecture

The project is split into a **Frontend** and a **backend**.

### Frontend (`Frontend/`)
React 19 + Vite + TypeScript, styled with Tailwind and Motion. The UI is a
turntable/vinyl metaphor: hold the microphone to hum, watch the disc "press"
your record, then play it back. API helpers live in `api/` and talk to the
backend endpoints.

Run it:
```bash
cd Frontend
npm install
npm run dev
```

### Backend (`backend/`)
Python (Flask, app factory in `src/app`) built with `uv`. It has two layers:

1. **Accompaniment engine** (`accompanist/` workspace package) — converts a
   melody (MIDI pitch + beats) into chords and renders MIDI/WAV using
   `music21`, `pretty-midi`, `mido`, and FluidSynth. Exposed at
   `/accompaniment/generate`.
2. **App layer** — Auth0-protected `/api/*` endpoints backed by
   TigerData/PostgreSQL (SQLAlchemy + Flask-Migrate) for users, recordings,
   posts, comments, and likes. A `/talk` route handles voice-driven edits
   (ElevenLabs + Google GenAI).

Run it:
```bash
cd backend/src
uv run flask --app app:create_app run --port 8000
```

## API at a glance

- `POST /accompaniment/generate` — melody in, MIDI/WAV/metadata out (no auth).
- `GET /api/me` — current user (auto-created on first authenticated call).
- `POST /api/recordings`, `GET /api/recordings/{id}/audio|midi` — save and
  stream generated songs.
- `POST /api/posts`, `/comments`, `/like` — the discussion hub.

Full references live in `backend/README.md` and `backend/docs/`
(`USER ACC.md`, `AUTH.md`, `DATABASE.md`, `API.md`).

## Contributing rules

- Always create a new branch when working on a new feature; merge only when it
  works and integrates with the codebase.
- Define a task for each commit, and only commit when that task is finished.
- Test against the whole codebase before committing.
