# Debug audio tools

Generated accompanist MIDI/WAV files are stored under:

```text
backend/accompanist/debug_outputs/
├── basic/      # original basic test and accompanied output
├── default/    # default classical render
├── folk/       # Asian-folk/pentatonic comparison
├── complex/    # 16-bar complex melody comparison
├── weird/      # chromatic sharp/flat stress test
└── generated/  # future make_test_wav.py output
```

## Play comparisons

```bash
cd backend/accompanist

# Basic
afplay debug_outputs/basic/test_original.wav
afplay debug_outputs/basic/test.wav

# Complex melody
afplay debug_outputs/complex/complex_melody.wav
afplay debug_outputs/complex/complex_accompaniment.wav

# Weird chromatic melody
afplay debug_outputs/weird/weird_melody.wav
afplay debug_outputs/weird/weird_result.wav
```

## Generate future debug WAVs

Relative output names from `make_test_wav.py` now go into
`backend/accompanist/debug_outputs/generated/` automatically:

```bash
cd backend/accompanist
.venv/bin/python make_test_wav.py classical test.wav synth
.venv/bin/python make_test_wav.py jazz jazz.wav guitar_jazz
```

## Test the Flask WAV endpoint

```bash
curl -X POST http://localhost:8000/accompaniment/generate \
  -H "Content-Type: application/json" \
  -d '{"melody":[...],"format":"wav"}' \
  --output debug_outputs/generated/api_result.wav
```
