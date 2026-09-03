"""Sample gate: filters sim artifacts before flight detection.

MSFS reports garbage while a flight loads (airborne flag with bouncing
altitude, teleport-sized jumps) and frozen values while paused or in a menu.
The gate drops frozen duplicates, rejects teleports, and after any
discontinuity requires a short stability window before trusting samples again.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from flight_recorder.telemetry import Sample

MAX_ALT_STEP_FT = 400.0  # per-sample altitude jump beyond any real climb
MAX_POS_STEP_DEG = 0.01  # ~0.6 nm per sample; nothing GA moves that fast
STABLE_SAMPLES = 3  # clean samples required after a discontinuity


@dataclass
class SampleGate:
    _prev: Sample | None = None
    _stable_needed: int = field(default=STABLE_SAMPLES)

    def accept(self, sample: Sample) -> bool:
        prev = self._prev
        if prev is None:
            self._prev = sample
            return False  # first sample only seeds the comparison

        frozen = (
            sample.lat == prev.lat
            and sample.lon == prev.lon
            and sample.alt_ft == prev.alt_ft
            and sample.gs_kt == prev.gs_kt
        )
        if frozen:
            # Paused sim / menu: identical readings carry no information and
            # would otherwise record dead time into the flight.
            return False

        teleport = (
            abs(sample.alt_ft - prev.alt_ft) > MAX_ALT_STEP_FT
            or abs(sample.lat - prev.lat) > MAX_POS_STEP_DEG
            or abs(sample.lon - prev.lon) > MAX_POS_STEP_DEG
        )
        self._prev = sample
        if teleport:
            self._stable_needed = STABLE_SAMPLES
            return False

        if self._stable_needed > 0:
            self._stable_needed -= 1
            return False

        return True
