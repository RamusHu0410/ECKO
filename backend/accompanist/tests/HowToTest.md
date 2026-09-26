test_melody.py:
cd backend/accompanist
uv run pytest

test_render.py:
cd backend/accompanist
uv run pytest -v

Full:
cd backend/accompanist
uv run python -c "
from app.models.melody import Melody
from app.music.melody_to_midi import melody_to_midi
from app.audio.render import render_midi

data = {
  'melody': [
    {'hz': 60, 'start': 0,   'duration': 0.5},
    {'hz': 64, 'start': 0.5, 'duration': 0.5},
    {'hz': 67, 'start': 1,   'duration': 1}
  ],
  'key': 'C', 'mode': 'major', 'tempo': 100
}
m = Melody.from_dict(data)
melody_to_midi(m, 'test.mid')
render_midi('test.mid', 'test.wav')
print('wrote test.mid and test.wav')
"
afplay test.wav   # macOS playback



Full2:
uv run python -c "
from app.models.melody import Melody, Note
from app.music.melody_to_midi import melody_to_midi
from app.music.midi_reader import read_midi
from app.music.key_detection import detect_key
from app.music.melody_extractor import extract_melody

melody_to_midi(Melody(notes=[Note(60,0,0.5),Note(64,0.5,0.5),Note(67,1.0,1.0)], tempo=120), 'test.mid')
print('key:', detect_key('test.mid'))
print('notes:', extract_melody(read_midi('test.mid')))
"



