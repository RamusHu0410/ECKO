"""The song's settings and the plain arithmetic that changes them.

Same three dials as the main app's "Your song" panel (useSongSettings.ts): each runs from
0 (moody / slower / lower) to 1 (bright / faster / higher), with 0.5 in the middle.
Gemini only says which way and how much; the numbers are always worked out here.
"""

import math
import re
from dataclasses import dataclass, replace

from .commands import Adjustment, Command

DIALS = ("emotion", "speed", "pitch")
MIDDLE = 0.5
STEPS = {"slight": 0.1, "moderate": 0.2, "strong": 0.35}
MAX_EXTRAS = 8
LABEL_PATTERN = re.compile(r"[a-z0-9][a-z0-9 &'-]{0,23}")


@dataclass(frozen=True)
class SongSettings:
    emotion: float = MIDDLE
    speed: float = MIDDLE
    pitch: float = MIDDLE
    style: str | None = None
    extras: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, data: dict | None) -> "SongSettings":
        """Reads settings sent by the page. Raises ValueError when they aren't usable."""
        if data is None:
            return cls()
        if not isinstance(data, dict):
            raise ValueError("settings must be an object")
        dials = {name: _read_dial(data.get(name, MIDDLE), name) for name in DIALS}
        extras = data.get("extras") or []
        if not isinstance(extras, list):
            raise ValueError("extras must be a list")
        style = data.get("style")
        return cls(**dials, style=clean_label(style) if style else None, extras=_merge_extras((), extras, ()))

    def to_dict(self) -> dict:
        return {
            "emotion": self.emotion,
            "speed": self.speed,
            "pitch": self.pitch,
            "style": self.style,
            "extras": list(self.extras),
        }


def clean_label(text) -> str | None:
    """A short lowercase label like 'rock' or 'lo-fi', or None if it isn't one."""
    if not isinstance(text, str):
        return None
    label = " ".join(text.lower().split())
    return label if LABEL_PATTERN.fullmatch(label) else None


def move_dial(value: float, direction: str, amount: str) -> float:
    if direction == "reset":
        return MIDDLE
    if amount == "max":
        return 1.0 if direction == "up" else 0.0
    step = STEPS[amount] if direction == "up" else -STEPS[amount]
    return round(min(1.0, max(0.0, value + step)), 2)


def apply_command(settings: SongSettings, command: Command) -> SongSettings:
    """The settings after Gemini's changes. Unknown or invalid labels are simply ignored."""
    dials = {name: getattr(settings, name) for name in DIALS}
    for change in command.adjustments:
        dials[change.setting] = move_dial(dials[change.setting], change.direction, change.amount)
    style = clean_label(command.style) or settings.style
    extras = _merge_extras(settings.extras, command.extras_add, command.extras_remove)
    return replace(settings, **dials, style=style, extras=extras)


def changed_fields(before: SongSettings, after: SongSettings) -> list[str]:
    return [name for name in (*DIALS, "style", "extras") if getattr(before, name) != getattr(after, name)]


def blocked_adjustments(before: SongSettings, command: Command) -> list[Adjustment]:
    """Changes that did nothing because the dial was already at that end (or already normal)."""
    return [c for c in command.adjustments if move_dial(getattr(before, c.setting), c.direction, c.amount) == getattr(before, c.setting)]


def _read_dial(value, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a number from 0 to 1")
    return round(min(1.0, max(0.0, float(value))), 2)


def _merge_extras(current, add, remove) -> tuple[str, ...]:
    removed = {clean_label(item) for item in remove}
    merged = [item for item in current if item not in removed]
    for item in map(clean_label, add):
        if item and item not in merged and item not in removed:
            merged.append(item)
    return tuple(merged[-MAX_EXTRAS:])
