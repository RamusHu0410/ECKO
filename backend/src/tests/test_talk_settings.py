"""The settings arithmetic: steps, limits, resets, styles and extras. No network."""

import pytest

from app.talk.commands import Adjustment, Command
from app.talk.settings import SongSettings, apply_command, blocked_adjustments, changed_fields, clean_label, move_dial


def command(*changes, style=None, add=(), remove=()):
    adjustments = [Adjustment(setting=s, direction=d, amount=a) for s, d, a in changes]
    return Command(intent="adjust", adjustments=adjustments, style=style, extras_add=list(add), extras_remove=list(remove), reply="ok")


@pytest.mark.parametrize(
    ("start", "direction", "amount", "expected"),
    [
        (0.5, "up", "slight", 0.6),
        (0.5, "down", "moderate", 0.3),
        (0.5, "up", "strong", 0.85),
        (0.2, "down", "strong", 0.0),  # stops at the bottom
        (0.95, "up", "moderate", 1.0),  # stops at the top
        (0.3, "up", "max", 1.0),
        (0.7, "down", "max", 0.0),
        (0.9, "reset", "moderate", 0.5),
        (0.1, "up", "slight", 0.2),  # no 0.20000000000000001
    ],
)
def test_move_dial(start, direction, amount, expected):
    assert move_dial(start, direction, amount) == expected


def test_relative_changes_build_on_the_current_settings():
    now = SongSettings(emotion=0.5, speed=0.7, pitch=0.5)
    after = apply_command(now, command(("speed", "up", "moderate"), ("emotion", "up", "slight")))
    assert (after.speed, after.emotion, after.pitch) == (0.9, 0.6, 0.5)
    assert changed_fields(now, after) == ["emotion", "speed"]


def test_style_and_extras():
    after = apply_command(SongSettings(extras=("piano",)), command(style="  Rock ", add=["Drums", "drums"], remove=["piano"]))
    assert after.style == "rock"
    assert after.extras == ("drums",)


def test_bad_labels_are_ignored():
    after = apply_command(SongSettings(style="jazz"), command(style="<script>", add=["x" * 60, ""]))
    assert after.style == "jazz"
    assert after.extras == ()


@pytest.mark.parametrize(("text", "expected"), [("Lo-Fi", "lo-fi"), ("drum & bass", "drum & bass"), ("rock!", None), (42, None), ("", None)])
def test_clean_label(text, expected):
    assert clean_label(text) == expected


def test_extras_keep_the_newest_eight():
    many = command(add=[f"extra {n}" for n in range(4)])
    settings = SongSettings(extras=tuple(f"old {n}" for n in range(6)))
    assert apply_command(settings, many).extras == ("old 2", "old 3", "old 4", "old 5", "extra 0", "extra 1", "extra 2", "extra 3")


def test_blocked_adjustments_find_changes_that_did_nothing():
    at_top = SongSettings(speed=1.0)
    blocked = blocked_adjustments(at_top, command(("speed", "up", "moderate"), ("pitch", "up", "slight")))
    assert [(b.setting, b.direction) for b in blocked] == [("speed", "up")]


def test_from_dict_reads_and_clamps_what_the_page_sends():
    settings = SongSettings.from_dict({"emotion": 1.4, "speed": 0, "pitch": 0.333, "style": "Jazz", "extras": ["Drums", 5]})
    assert settings == SongSettings(emotion=1.0, speed=0.0, pitch=0.33, style="jazz", extras=("drums",))
    assert SongSettings.from_dict(None) == SongSettings()
    assert SongSettings.from_dict({}).to_dict() == {"emotion": 0.5, "speed": 0.5, "pitch": 0.5, "style": None, "extras": []}


@pytest.mark.parametrize("bad", [{"speed": "fast"}, {"speed": True}, {"pitch": float("nan")}, {"extras": "drums"}, ["not", "a", "dict"]])
def test_from_dict_rejects_nonsense(bad):
    with pytest.raises(ValueError):
        SongSettings.from_dict(bad)
