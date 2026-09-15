"""Flight boundary detection.

State machine over the sample stream:

  IDLE --(airborne for AIRBORNE_DEBOUNCE samples)--> FLYING
  FLYING --(on ground, slow, for LANDED_HOLD_SEC)--> flight finalized

A touch-and-go (airborne again before the hold expires) extends the same
flight and is kept as a landing of its own. A landing is a sequence of
touchdowns: every return to the ground is recorded, a short hop between
them is a bounce, and the landing rate is the HARDEST touchdown of the
sequence — the sim's own touchdown sensor when it reported one, else the
last sampled airborne VS. `Flight.landings` holds every landing in order,
the full stop last; the flight-level fpm/bounces describe that full stop.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from flight_recorder.telemetry import Sample

log = logging.getLogger(__name__)

AIRBORNE_DEBOUNCE = 3  # consecutive off-ground samples to call it a departure
LANDED_HOLD_SEC = 120.0  # continuous ground time to call the flight over
TAXI_SPEED_KT = 35.0  # above this on the ground we assume a takeoff/landing roll
TAXI_BUFFER_SEC = 1200.0  # ground history kept so taxi-out/runup are recorded
TAXI_MOVING_KT = 5.0  # taxi-out starts at the first movement above this
TAXI_LEAD_SEC = 10.0  # keep a little context before that first movement
# Airborne again after a touchdown: a bounce until it lasts longer or climbs
# higher than this — then it was a touch-and-go and the landing is forgotten.
BOUNCE_MAX_SEC = 10.0
BOUNCE_MAX_AGL_FT = 50.0
# The sim's touchdown sensor holds a value; a change bigger than this while
# continuously on the ground means a touchdown happened between polls.
SENSOR_CHANGE_FPM = 1.0
# Same idea for the latched touchdown position: a jump of more than ~20 ft
# while continuously on the ground is a touchdown the poll never saw airborne.
TD_POSITION_CHANGE_DEG = 0.00006
# The velocity and position latches update on different frames; a change
# arriving this soon after a touchdown belongs to it, not to a new one.
LATCH_MERGE_SEC = 0.5


@dataclass
class Touchdown:
    ts: float
    vs_fpm: float | None  # last sampled airborne VS before it (fallback)
    sensor_fpm: float = 0.0  # PLANE_TOUCHDOWN_NORMAL_VELOCITY, ft/min positive down
    world_vs_fpm: float | None = None  # last sampled airborne VELOCITY_WORLD_Y (fpm, negative = down)
    pos: tuple[float, float] | None = None  # PLANE_TOUCHDOWN_LATITUDE/LONGITUDE latch

    @property
    def rate_fpm(self) -> int | None:
        """Hardest of the available readings, negative = descending. The
        sensor (when the wrapper actually served it) is the sim's own number;
        the sampled velocities are the last airborne poll, up to 0.1 s early
        at 10 Hz. Reporting the hardest is deliberate: none of them can
        overstate a touchdown by much, and each can miss one."""
        candidates = []
        if self.sensor_fpm > 0:
            candidates.append(-round(self.sensor_fpm))
        if self.world_vs_fpm is not None and self.world_vs_fpm != 0:
            candidates.append(round(self.world_vs_fpm))
        if self.vs_fpm is not None:
            candidates.append(round(self.vs_fpm))
        return min(candidates) if candidates else None


@dataclass
class LandingEvent:
    """One landing: its touchdowns and how it ended — a full stop, or a
    touch-and-go that lifted off again at `liftoff_ts`."""

    touchdowns: list[Touchdown]
    kind: str  # "stop" | "touchAndGo"
    liftoff_ts: float | None = None

    @property
    def rate_fpm(self) -> int | None:
        rates = [t.rate_fpm for t in self.touchdowns if t.rate_fpm is not None]
        return min(rates) if rates else None


@dataclass
class Flight:
    samples: list[Sample]  # spans block time: taxi-out through taxi-in
    departure_ts: float  # wheels-up (flight time zero)
    arrival_ts: float  # wheels-down (first touchdown of the landing)
    landing_rate_fpm: float | None  # hardest touchdown, negative = descending
    bounces: int = 0  # touchdowns beyond the first
    touchdowns_fpm: list[int] = field(default_factory=list)  # each touchdown, in order
    touchdowns: list[Touchdown] = field(default_factory=list)  # the full stop's records
    landings: list[LandingEvent] = field(default_factory=list)  # every landing, touch-and-gos first


@dataclass
class FlightDetector:
    _flying: bool = False
    _airborne_streak: int = 0
    _samples: list[Sample] = field(default_factory=list)
    _taxi_buffer: list[Sample] = field(default_factory=list)
    _departure_ts: float | None = None
    _touchdown_ts: float | None = None  # first touchdown of the current landing
    _touchdowns: list[Touchdown] = field(default_factory=list)
    _airborne_since: float | None = None  # lifted off again after a touchdown
    _bounce_peak_agl: float = 0.0
    _last_airborne_vs: float | None = None
    _last_airborne_world_vs: float | None = None
    # Latched touchdown position while airborne: the previous landing's.
    _stale_td_pos: tuple[float, float] = (0.0, 0.0)
    # What the touchdown sensor read while airborne: the PREVIOUS landing's
    # value, which the sim keeps reporting until the wheels touch again.
    _stale_sensor_fpm: float = 0.0
    _landings: list[LandingEvent] = field(default_factory=list)

    def feed(self, sample: Sample) -> Flight | None:
        """Feed one sample; returns a finalized Flight when one completes."""
        if not self._flying:
            if not sample.on_ground:
                self._airborne_streak += 1
                self._samples.append(sample)
                if self._airborne_streak >= AIRBORNE_DEBOUNCE:
                    self._flying = True
                    self._departure_ts = self._samples[0].ts
                    # Prepend the taxi-out: buffered ground history, trimmed
                    # to start just before the aircraft first began moving
                    # (drops parked-at-the-gate time, keeps taxi + runup).
                    taxi = [t for t in self._taxi_buffer if t.ts >= self._departure_ts - TAXI_BUFFER_SEC]
                    first_moving = next((i for i, t in enumerate(taxi) if t.gs_kt > TAXI_MOVING_KT), None)
                    if first_moving is not None:
                        lead_ts = taxi[first_moving].ts - TAXI_LEAD_SEC
                        taxi = [t for t in taxi if t.ts >= lead_ts]
                        self._samples = taxi + self._samples
                    self._taxi_buffer = []
                    log.info("departure detected at %.4f, %.4f", sample.lat, sample.lon)
            else:
                self._airborne_streak = 0
                self._samples = []
                self._taxi_buffer.append(sample)
                cutoff = sample.ts - TAXI_BUFFER_SEC
                while self._taxi_buffer and self._taxi_buffer[0].ts < cutoff:
                    self._taxi_buffer.pop(0)
            return None

        self._samples.append(sample)

        if not sample.on_ground:
            self._last_airborne_vs = sample.vs_fpm
            self._last_airborne_world_vs = sample.world_vs_fpm
            if not self._touchdowns:
                self._stale_sensor_fpm = sample.touchdown_fpm
                self._stale_td_pos = (sample.td_lat, sample.td_lon)
                return None
            # Back in the air after touching down: a bounce, unless it goes on
            # long enough or high enough to be a touch-and-go.
            if self._airborne_since is None:
                self._airborne_since = sample.ts
                self._bounce_peak_agl = 0.0
            self._bounce_peak_agl = max(self._bounce_peak_agl, sample.agl_ft)
            if sample.ts - self._airborne_since > BOUNCE_MAX_SEC or self._bounce_peak_agl > BOUNCE_MAX_AGL_FT:
                log.info("touch-and-go after %d touchdown(s); landing #%d kept", len(self._touchdowns), len(self._landings) + 1)
                self._landings.append(LandingEvent(list(self._touchdowns), "touchAndGo", self._airborne_since))
                self._touchdowns = []
                self._touchdown_ts = None
                self._airborne_since = None
                self._stale_sensor_fpm = sample.touchdown_fpm
                self._stale_td_pos = (sample.td_lat, sample.td_lon)
            return None

        if not self._touchdowns:
            self._touchdown_ts = sample.ts
            self._touchdowns.append(Touchdown(sample.ts, self._last_airborne_vs, world_vs_fpm=self._last_airborne_world_vs))
            log.info("touchdown at %.4f, %.4f — flight finalizes after the rollout hold", sample.lat, sample.lon)
        elif self._airborne_since is not None:
            self._airborne_since = None
            self._touchdowns.append(Touchdown(sample.ts, self._last_airborne_vs, world_vs_fpm=self._last_airborne_world_vs))
            log.info("bounce: touchdown #%d", len(self._touchdowns))

        # Attribute the sim's latched touchdown readings (normal velocity,
        # position) to the current touchdown. A latch that differs from what
        # this touchdown already holds is a NEW touchdown the poll never saw
        # airborne — a skip shorter than the poll interval.
        current = self._touchdowns[-1]
        sensor = sample.touchdown_fpm
        td_pos = (sample.td_lat, sample.td_lon)
        # "Fresh" means changed since the last value we attributed to ANY
        # touchdown of this landing (else the pre-landing value): a second
        # touchdown must not inherit the first one's reading just because it
        # differs from what the sensor said in the air.
        known_sensor = next((t.sensor_fpm for t in reversed(self._touchdowns) if t.sensor_fpm > 0), self._stale_sensor_fpm)
        known_pos = next((t.pos for t in reversed(self._touchdowns) if t.pos is not None), self._stale_td_pos)
        sensor_fresh = sensor > 0 and abs(sensor - known_sensor) > SENSOR_CHANGE_FPM
        pos_fresh = td_pos != (0.0, 0.0) and _moved(td_pos, known_pos)
        new_by_sensor = sensor_fresh and current.sensor_fpm > 0
        new_by_pos = pos_fresh and current.pos is not None
        if (new_by_sensor or new_by_pos) and sample.ts - current.ts < LATCH_MERGE_SEC:
            # The other latch catching up on the touchdown we already have
            if new_by_sensor and sensor > current.sensor_fpm:
                current.sensor_fpm = sensor  # keep the harder reading
            if new_by_pos:
                current.pos = td_pos
            new_by_sensor = new_by_pos = False
        elif new_by_sensor or new_by_pos:
            current = Touchdown(sample.ts, None)
            self._touchdowns.append(current)
            log.info("bounce between polls: touchdown #%d (latched %s changed)", len(self._touchdowns),
                     "sensor" if new_by_sensor else "position")
        if sensor_fresh and current.sensor_fpm <= 0:
            current.sensor_fpm = sensor
        if pos_fresh and current.pos is None:
            current.pos = td_pos

        assert self._touchdown_ts is not None
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
        # Keep the taxi-in: everything up to shortly after the last movement
        # on the ground, so only the parked tail of the landed hold is cut.
        last_moving = next(
            (s.ts for s in reversed(self._samples) if s.ts >= self._touchdown_ts and s.gs_kt > 3.0),
            self._touchdown_ts,
        )
        cutoff = max(self._touchdown_ts + 10.0, last_moving + 5.0)
        samples = [s for s in self._samples if s.ts <= cutoff]

        # Each touchdown prefers the sim's own reading (PLANE_TOUCHDOWN_NORMAL_
        # VELOCITY, ft/min, positive down — verified against a real flight)
        # over the sampled last-airborne VS. The landing is scored on the
        # hardest of them: a bounce must not launder a hard hit into the
        # gentle settle that follows it.
        rates = [t.rate_fpm for t in self._touchdowns if t.rate_fpm is not None]
        landings = [*self._landings, LandingEvent(list(self._touchdowns), "stop")]
        flight = Flight(
            samples=samples,
            departure_ts=self._departure_ts,
            arrival_ts=self._touchdown_ts,
            landing_rate_fpm=min(rates) if rates else None,
            bounces=len(self._touchdowns) - 1,
            touchdowns_fpm=rates,
            touchdowns=list(self._touchdowns),
            landings=landings,
        )
        self.__init__()  # reset for the next flight
        return flight


def _moved(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return abs(a[0] - b[0]) > TD_POSITION_CHANGE_DEG or abs(a[1] - b[1]) > TD_POSITION_CHANGE_DEG
