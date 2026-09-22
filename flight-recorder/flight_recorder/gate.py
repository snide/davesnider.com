"""Sample gate: filters sim artifacts before flight detection.

MSFS reports garbage while a flight loads (airborne flag with bouncing
altitude, teleport-sized jumps) and frozen values while paused or in a menu.
The gate drops frozen duplicates, rejects teleports, and after any
discontinuity requires a short stability window before trusting samples again.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from flight_recorder.geo import haversine_nm
from flight_recorder.telemetry import Sample

MAX_ALT_STEP_FT = 400.0  # per-sample altitude jump beyond any real climb
MAX_POS_STEP_DEG = 0.01  # ~0.6 nm per sample; nothing GA moves that fast
# A jump smaller than MAX_POS_STEP_DEG can still be a teleport: the crash
# reset at KPWK (2026-09-21) put the aircraft 2,350 ft back on the runway in
# one second at 0 kt ground speed, well under 0.01°. So the distance covered
# between samples is also checked against the ground speed the sim reports.
# The factor leaves room for sim-rate acceleration (4× at 200 kt is 800 kt
# implied) and the slack for 10 Hz position jitter.
TELEPORT_SPEED_FACTOR = 4.0
TELEPORT_SPEED_SLACK_KT = 150.0
STABLE_SAMPLES = 3  # clean samples required after a discontinuity


def _implied_kt(prev: Sample, sample: Sample) -> float:
    """Ground speed the position change implies, knots."""
    dt = sample.ts - prev.ts
    if dt <= 0:
        return 0.0
    return haversine_nm(prev.lat, prev.lon, sample.lat, sample.lon) / dt * 3600.0


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
            # A crash freezes the aircraft too; the flag flipping is news
            and sample.crash_flag == prev.crash_flag
            and sample.crash_sequence == prev.crash_sequence
        )
        if frozen:
            # Paused sim / menu: identical readings carry no information and
            # would otherwise record dead time into the flight.
            return False

        teleport = (
            abs(sample.alt_ft - prev.alt_ft) > MAX_ALT_STEP_FT
            or abs(sample.lat - prev.lat) > MAX_POS_STEP_DEG
            or abs(sample.lon - prev.lon) > MAX_POS_STEP_DEG
            or _implied_kt(prev, sample) > TELEPORT_SPEED_FACTOR * max(prev.gs_kt, sample.gs_kt) + TELEPORT_SPEED_SLACK_KT
        )
        self._prev = sample
        if teleport:
            self._stable_needed = STABLE_SAMPLES
            return False

        if self._stable_needed > 0:
            self._stable_needed -= 1
            return False

        return True
