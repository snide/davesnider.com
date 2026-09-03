"""Flight boundary detection.

State machine over the sample stream:

  IDLE --(airborne for AIRBORNE_DEBOUNCE samples)--> FLYING
  FLYING --(on ground, slow, for LANDED_HOLD_SEC)--> flight finalized

A touch-and-go (airborne again before the hold expires) extends the same
flight. Landing rate is the vertical speed of the last airborne sample before
the final touchdown.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from flight_recorder.telemetry import Sample

log = logging.getLogger(__name__)

AIRBORNE_DEBOUNCE = 3  # consecutive off-ground samples to call it a departure
LANDED_HOLD_SEC = 120.0  # continuous ground time to call the flight over
TAXI_SPEED_KT = 35.0  # above this on the ground we assume a takeoff/landing roll


@dataclass
class Flight:
    samples: list[Sample]
    departure_ts: float
    arrival_ts: float
    landing_rate_fpm: float | None


@dataclass
class FlightDetector:
    _flying: bool = False
    _airborne_streak: int = 0
    _samples: list[Sample] = field(default_factory=list)
    _departure_ts: float | None = None
    _touchdown_ts: float | None = None
    _landing_rate: float | None = None
    _last_airborne_vs: float | None = None

    def feed(self, sample: Sample) -> Flight | None:
        """Feed one sample; returns a finalized Flight when one completes."""
        if not self._flying:
            if not sample.on_ground:
                self._airborne_streak += 1
                self._samples.append(sample)
                if self._airborne_streak >= AIRBORNE_DEBOUNCE:
                    self._flying = True
                    self._departure_ts = self._samples[0].ts
                    log.info("departure detected at %.4f, %.4f", sample.lat, sample.lon)
            else:
                # Keep a short pre-roll so the track starts on the runway.
                self._airborne_streak = 0
                self._samples = [sample] if sample.gs_kt >= TAXI_SPEED_KT else []
            return None

        self._samples.append(sample)

        if not sample.on_ground:
            self._last_airborne_vs = sample.vs_fpm
            self._touchdown_ts = None
            self._landing_rate = None
            return None

        if self._touchdown_ts is None:
            self._touchdown_ts = sample.ts
            self._landing_rate = self._last_airborne_vs
            log.info("touchdown at %.4f, %.4f — flight finalizes after the rollout hold", sample.lat, sample.lon)

        # Still rolling out fast? The hold clock runs regardless; a touch-and-go
        # resets it by going airborne again.
        if sample.ts - self._touchdown_ts >= LANDED_HOLD_SEC and sample.gs_kt < TAXI_SPEED_KT:
            return self._finalize()
        return None

    @property
    def in_flight(self) -> bool:
        return self._flying

    @property
    def departure_ts(self) -> float | None:
        return self._departure_ts

    @property
    def pending_samples(self) -> list[Sample]:
        return list(self._samples)

    def flush(self) -> Flight | None:
        """Finalize a flight in progress (e.g. replay input ended on the runway)."""
        if self._flying and self._touchdown_ts is not None:
            return self._finalize()
        return None

    def _finalize(self) -> Flight:
        assert self._departure_ts is not None and self._touchdown_ts is not None
        # Trim the post-landing hold from the track: keep up to shortly after touchdown.
        cutoff = self._touchdown_ts + 30.0
        samples = [s for s in self._samples if s.ts <= cutoff]

        # Prefer the sim's own touchdown reading (PLANE_TOUCHDOWN_NORMAL_VELOCITY,
        # ft/min, positive down — verified against a real flight) over the
        # sampled last-airborne VS carried on post-touchdown ground samples.
        landing_rate = round(self._landing_rate) if self._landing_rate is not None else None
        official_fpm = max(
            (s.touchdown_fpm for s in samples if s.on_ground and s.ts >= self._touchdown_ts),
            default=0.0,
        )
        if official_fpm > 0:
            landing_rate = -round(official_fpm)

        flight = Flight(
            samples=samples,
            departure_ts=self._departure_ts,
            arrival_ts=self._touchdown_ts,
            landing_rate_fpm=landing_rate,
        )
        self.__init__()  # reset for the next flight
        return flight
