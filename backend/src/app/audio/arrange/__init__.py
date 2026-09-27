"""The back half of the audio pipeline: a clean melody (melody.json) -> transformations ->
orchestral multi-track MIDI -> FluidSynth render -> effects -> final 24-bit WAV.

See steps.py for the files each step writes, and config.py for the styles.
"""

from .config import STYLES
from .errors import PipelineError
from .steps import FILES, STEPS, RenderResult, StepReport, arrange_and_render, run_steps

__all__ = [
    "FILES",
    "STEPS",
    "STYLES",
    "PipelineError",
    "RenderResult",
    "StepReport",
    "arrange_and_render",
    "run_steps",
]
