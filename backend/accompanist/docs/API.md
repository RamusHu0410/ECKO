# Accompaniment API

The accompaniment engine (`accompanist`) is wired into the Flask backend
(`backend/src/app`). It takes a melody as JSON and returns a generated
accompaniment as MIDI, WAV, or JSON metadata.

## Running the server

The engine is installed as a dependency of the Flask backend, so run it from
`backend/` (Python 3.14 venv):

```bash
cd backend
.venv/bin/python -c "from app import create_app; create_app('development').run(host='127.0.0.1', port=5000)"
```

- **Host:** `127.0.0.1`
- **Port:** `5000` (Flask default — no port is set explicitly in the app)
- **Base URL:** `http://127.0.0.1:5000`

> WAV output requires FluidSynth and a soundfont on the machine (see
> `accompanist/README` / Phase 3). If they are missing, `format=wav` returns
> HTTP 503; `midi` and `json` always work.

---

## Endpoints

### `GET /accompaniment/styles`

List the available accompaniment styles.

**Response `200`**
```json
{ "styles": ["asian_folk", "cinematic", "classical", "jazz", "piano", "pop"] }
```

---

### `POST /accompaniment/generate`

Generate an accompaniment for a melody.

**Request headers:** `Content-Type: application/json`

**Request body**

| Field     | Type    | Required | Default       | Notes |
|-----------|---------|----------|---------------|-------|
| `melody`  | array   | yes      | —             | List of note objects (see below). |
| `key`     | string  | no       | auto-detected | Tonic, e.g. `"C"`, `"G"`, `"F#"`. If omitted, the key is detected from the melody. |
| `mode`    | string  | no       | auto-detected | `"major"` or `"minor"`. |
| `tempo`   | number  | no       | `120`         | Beats per minute. |
| `style`   | string  | no       | `"classical"` | One of `piano`, `pop`, `cinematic`, `classical`, `jazz`, `asian_folk`. |
| `instrument` | string | no      | `"synth"`     | Playback instrument. Common choices: `synth` (GM sawtooth lead), `synth_pad`, `piano`, `guitar`, `guitar_jazz`, `strings`, `sax`. |
| `format`  | string  | no       | `"midi"`      | `"midi"`, `"wav"`, or `"json"`. |

**Note object** (inside `melody`)

| Field      | Type   | Notes |
|------------|--------|-------|
| `hz`       | number | MIDI pitch number (e.g. `60` = middle C). Despite the name, this is a MIDI note number, not a frequency. |
| `start`    | number | Onset time **in beats**. |
| `duration` | number | Length **in beats**. |

> Timing is measured in beats: segmentation puts one chord per bar (4 beats in
> 4/4). A melody shorter than one bar produces a single chord.

**Example request**
```bash
curl -X POST http://127.0.0.1:5000/accompaniment/generate \
  -H "Content-Type: application/json" \
  -d '{
        "melody": [
          {"hz": 60, "start": 0, "duration": 1},
          {"hz": 64, "start": 1, "duration": 1},
          {"hz": 67, "start": 2, "duration": 1},
          {"hz": 72, "start": 3, "duration": 1}
        ],
        "style": "classical",
        "instrument": "synth",
        "format": "midi"
      }' \
  --output accompaniment.mid
```

#### Responses by `format`

**`format: "midi"`** (default)
- `200 OK`, `Content-Type: audio/midi`
- Body: a Standard MIDI file (attachment `accompaniment_<id>.mid`).
- Contains an accompaniment track plus the original melody track.

**`format: "wav"`**
- `200 OK`, `Content-Type: audio/wav`
- Body: a 44.1 kHz stereo WAV (attachment `accompaniment_<id>.wav`).
- `503` if FluidSynth/soundfont are unavailable.

**`format: "json"`** (metadata only, no file)
```json
{
  "status": "success",
  "key": "C",
  "mode": "major",
  "style": "pop",
  "progression": ["C", "F", "G", "C", "Am", "F", "G", "C"],
  "num_notes": 32,
  "warnings": []
}
```

#### Error responses

| Status | When | Body |
|--------|------|------|
| `400`  | Missing/invalid `melody` | `{"error": "Request must be JSON with a 'melody' array."}` |
| `400`  | Unknown `style` | `{"error": "Unknown style 'reggae'.", "available_styles": [...]}` |
| `400`  | Invalid `format` | `{"error": "format must be 'midi', 'wav', or 'json'."}` |
| `400`  | Empty melody / bad input | `{"error": "Melody has no notes."}` |
| `503`  | WAV requested but FluidSynth/soundfont missing | `{"error": "WAV rendering unavailable ..."}` |
| `500`  | Unexpected engine failure | `{"error": "Generation failed", "details": "..."}` |

---

## Pipeline (what happens internally)

```
melody JSON
  → Melody model
  → key detection (or key/mode override)
  → segment into bars (1 chord/bar)
  → diatonic chord candidates
  → score each candidate against the bar's melody notes
  → progression optimization (Viterbi + transition rules)
  → voice leading (classical style)
  → style pattern (piano / pop / cinematic / classical / jazz / asian_folk)
  → default synth playback (or the requested instrument)
  → MIDI
  → WAV (optional)
```

See `accompanist/generate.py` (`generate_accompaniment`) for the entry point.
