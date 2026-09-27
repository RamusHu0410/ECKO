"""The one error both halves of the pipeline raise (see the pipeline contract)."""


class PipelineError(Exception):
    """A step failed in a way no fallback can cover.

    `step` names where it happened ("intake", "transform", "orchestrate", "render", "effects"),
    so a caller can report it or re-run from the step before.
    """

    def __init__(self, step: str, message: str):
        super().__init__(f"{step}: {message}")
        self.step = step
        self.message = message
