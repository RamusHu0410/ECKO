# How to connect and run backend

## How to run backend flask python server
uv run flask --app src/app:create_app run --port 8000




Start the server (terminal 1)
bash

cd /Users/ramushu/dev/ECKO/ECKO/backend/src
../.venv/bin/python -c "from app import create_app; create_app('development').run(host='127.0.0.1', port=8000)"
Test it (terminal 2)
List styles:

bash

curl http://127.0.0.1:8000/accompaniment/styles
Input format — POST JSON to /accompaniment/generate:

json

{
  "melody": [
    {"hz": 60, "start": 0, "duration": 1},
    {"hz": 64, "start": 1, "duration": 1},
    {"hz": 67, "start": 2, "duration": 1},
    {"hz": 72, "start": 3, "duration": 1}
  ],
  "style": "classical",
  "format": "midi"
}
hz = MIDI pitch number (60 = middle C), start/duration = beats
key, mode, tempo are optional (key auto-detected if omitted)
style: piano | pop | cinematic | classical
format: midi (default) | wav | json
Get metadata back (easiest to eyeball):

bash

curl -X POST http://127.0.0.1:8000/accompaniment/generate \
  -H "Content-Type: application/json" \
  -d '{"melody":[{"hz":60,"start":0,"duration":1},{"hz":64,"start":1,"duration":1},{"hz":67,"start":2,"duration":1},{"hz":72,"start":3,"duration":1}],"style":"pop","format":"json"}'
Returns:

json

{"status":"success","key":"C","mode":"major","style":"pop","progression":["C"],"num_notes":4,"warnings":[]}
Download the MIDI file:

bash

curl -X POST http://127.0.0.1:8000/accompaniment/generate \
  -H "Content-Type: application/json" \
  -d '{"melody":[{"hz":60,"start":0,"duration":1},{"hz":64,"start":1,"duration":1},{"hz":67,"start":2,"duration":1},{"hz":72,"start":3,"duration":1}],"style":"classical","format":"midi"}' \
  --output out.mid
Download the WAV (needs FluidSynth):

bash

curl -X POST http://127.0.0.1:8000/accompaniment/generate \
  -H "Content-Type: application/json" \
  -d '{"melody":[{"hz":60,"start":0,"duration":1},{"hz":64,"start":1,"duration":1}],"style":"piano","format":"wav"}' \
  --output out.wav
Output format
format=json → metadata (key, mode, progression) — no file
format=midi → a .mid file, Content-Type: audio/midi (accompaniment track + melody track)
format=wav → a .wav file, Content-Type: audio/wav
One tip: since timing is in beats and it's one chord per bar (4 beats), a melody spanning only a few beats gives a 1-chord progression. Use an 8-bar melody (notes with start from 0 up to ~31) if you want to see a full C F G C Am F G C-style progression.