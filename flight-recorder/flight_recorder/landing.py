"""Landing analysis: every landing of a flight as its own high-rate record.

The card used to get two integers (hardest touchdown fpm, bounce count) for
the final landing only; touch-and-gos vanished. This module turns each
`LandingEvent` from the detector plus the raw 10 Hz samples around it into
something that can be drawn and judged:

- a `t/agl/vs/ias/g/bank/hdg/x/d` segment from short final through the end
  of the rollout, in a runway-aligned frame (`x` = feet right of the
  centerline, `d` = feet past the threshold) — or, when the runway is not
  in the OurAirports database, aligned to the approach course through the
  first touchdown (`d` = feet past that touchdown);
- one record per touchdown: every descent-rate reading, peak G, attitude,
  crab and drift, speed, position and which gear hit first;
- the rollout's worst centerline offset and heading excursion, the float
  time from ten feet, and the runway matched (per landing — pattern work
  can switch runways);
- `kind` ("stop" / "touchAndGo") and, for a touch-and-go, `liftoffT`: the
  rollout is then the ground roll up to the wheels leaving again and the
  segment runs a few seconds into the climb-out.

Sign conventions live HERE, not in the sampler (the raw dump keeps the sim's
own signs): bank positive = right wing low, pitch positive = nose up, crab
positive = nose right of the ground track, x positive = right of centerline.
The bank/pitch signs are the sim's documented body-axis convention but have
not been checked against a real dump yet — flip `_bank_right` / `_pitch_up`
if a known left-wing-low landing reads the wrong way.
"""

from __future__ import annotations

import bisect
import math
import statistics
from dataclasses import dataclass

from flight_recorder.detector import Flight, LandingEvent
from flight_recorder.enrich import RunwayEnd
from flight_recorder.geo import bearing_deg, haversine_nm
from flight_recorder.telemetry import Sample

SEGMENT_BEFORE_SEC = 45.0  # short final kept before the first touchdown
SEGMENT_MAX_AFTER_SEC = 60.0  # rollout kept after the last touchdown, at most
SEGMENT_MIN_AFTER_SEC = 5.0
SEGMENT_MAX_POINTS = 600
ROLLOUT_END_KT = 25.0  # below this the rollout is a taxi
RUNWAY_HEADING_TOLERANCE_DEG = 30.0
RUNWAY_CROSS_MAX_FT = 500.0  # touchdown farther than this from any centerline: no match
RUNWAY_BEFORE_THRESHOLD_MAX_FT = 1500.0  # landing short of the paint still counts as this runway
FLOAT_AGL_FT = 10.0  # float = time below this above the wheels-on-ground reading
COURSE_MIN_FT = 30.0  # positions closer than this give no usable course
GEAR_COMPRESSION_MIN_PCT = 2.0
FT_PER_NM = 6076.12


@dataclass
class Frame:
    """Local flat-earth frame: `along` runs down the axis heading from the
    origin, `cross` is positive to the right of it."""

    lat: float
    lon: float
    axis_deg: float  # true

    def project(self, lat: float, lon: float) -> tuple[float, float]:
        north = (lat - self.lat) * 60.0 * FT_PER_NM
        east = (lon - self.lon) * 60.0 * FT_PER_NM * math.cos(math.radians(self.lat))
        a = math.radians(self.axis_deg)
        along = east * math.sin(a) + north * math.cos(a)
        cross = east * math.cos(a) - north * math.sin(a)
        return along, cross


def _angle_diff(a: float, b: float) -> float:
    """a - b wrapped to [-180, 180)."""
    return (a - b + 180.0) % 360.0 - 180.0


def _bank_right(raw_deg: float) -> float:
    return -raw_deg


def _pitch_up(raw_deg: float) -> float:
    return -raw_deg


def match_runway(ends: list[RunwayEnd], lat: float, lon: float, course_deg: float | None) -> RunwayEnd | None:
    """The runway end you landed on: heading within tolerance of the approach
    course (when known), touchdown near its centerline and not absurdly far
    before the threshold. Ties go to the closest centerline."""
    best: RunwayEnd | None = None
    best_cross = float("inf")
    for end in ends:
        if course_deg is not None and abs(_angle_diff(end.heading_deg, course_deg)) > RUNWAY_HEADING_TOLERANCE_DEG:
            continue
        along, cross = Frame(end.lat, end.lon, end.heading_deg).project(lat, lon)
        if abs(cross) > RUNWAY_CROSS_MAX_FT or along < -RUNWAY_BEFORE_THRESHOLD_MAX_FT:
            continue
        if end.length_ft and along > end.length_ft + RUNWAY_BEFORE_THRESHOLD_MAX_FT:
            continue
        if abs(cross) < best_cross:
            best, best_cross = end, abs(cross)
    return best


def _course_into(samples: list[Sample], i: int, min_sec: float = 1.0) -> float | None:
    """True ground course arriving at sample i, from the last sample at least
    `min_sec` earlier that is far enough away to give a direction."""
    target = samples[i]
    for j in range(i - 1, -1, -1):
        s = samples[j]
        if target.ts - s.ts < min_sec:
            continue
        if haversine_nm(s.lat, s.lon, target.lat, target.lon) * FT_PER_NM >= COURSE_MIN_FT:
            return bearing_deg(s.lat, s.lon, target.lat, target.lon)
        if target.ts - s.ts > 10.0:
            break
    return None


def _pick_uniform(times: list[float], i0: int, i1: int, limit: int) -> list[int]:
    """Indices i0..i1 inclusive thinned to at most `limit`, by time."""
    n = i1 - i0 + 1
    if n <= limit:
        return list(range(i0, i1 + 1))
    span = times[i1] - times[i0]
    out: list[int] = []
    for k in range(limit):
        target = times[i0] + span * k / (limit - 1)
        i = min(bisect.bisect_left(times, target, i0, i1 + 1), i1)
        if not out or i != out[-1]:
            out.append(i)
    if out[-1] != i1:
        out.append(i1)
    return out


def _r(value: float | None, digits: int = 0) -> float | int | None:
    if value is None:
        return None
    return round(value, digits) if digits else round(value)


def build_landings(flight: Flight, times: list[float], runway_ends: list[RunwayEnd] | None = None) -> list[dict]:
    """One record per landing, in flight order (the full stop last)."""
    out = []
    for event in flight.landings:
        record = build_landing(flight, times, runway_ends, event)
        if record is not None:
            out.append(record)
    return out


def build_landing(
    flight: Flight,
    times: list[float],
    runway_ends: list[RunwayEnd] | None = None,
    event: LandingEvent | None = None,
) -> dict | None:
    if event is None:
        event = flight.landings[-1] if flight.landings else LandingEvent(list(flight.touchdowns), "stop")
    touchdowns = event.touchdowns
    samples = flight.samples
    if not touchdowns or len(samples) < 2:
        return None
    ts_list = [s.ts for s in samples]
    # A touch-and-go's ground time ends where the wheels leave again
    end_ts = event.liftoff_ts if event.kind == "touchAndGo" and event.liftoff_ts else None

    def idx_at(ts: float) -> int:
        return min(bisect.bisect_left(ts_list, ts), len(samples) - 1)

    i_first = idx_at(touchdowns[0].ts)
    i_last_td = idx_at(touchdowns[-1].ts)
    first = samples[i_first]

    # Frame: the runway when we know it, else the approach course.
    approach_course = _course_into(samples, i_first)
    runway = match_runway(runway_ends or [], first.lat, first.lon, approach_course)
    if runway is not None:
        frame = Frame(runway.lat, runway.lon, runway.heading_deg)
        if runway.displaced_ft:
            # Move the origin down the runway to the displaced threshold
            a = math.radians(runway.heading_deg)
            frame = Frame(
                runway.lat + runway.displaced_ft * math.cos(a) / (60.0 * FT_PER_NM),
                runway.lon + runway.displaced_ft * math.sin(a) / (60.0 * FT_PER_NM * math.cos(math.radians(runway.lat))),
                runway.heading_deg,
            )
    else:
        axis = approach_course
        if axis is None:
            axis = first.heading_true_deg if first.heading_true_deg else first.heading_deg
        frame = Frame(first.lat, first.lon, axis)

    # Segment bounds: short final through the end of the rollout — or, for a
    # touch-and-go, a few seconds into the climb-out.
    i0 = bisect.bisect_left(ts_list, touchdowns[0].ts - SEGMENT_BEFORE_SEC)
    i1 = len(samples) - 1
    if end_ts is not None:
        i1 = min(bisect.bisect_right(ts_list, end_ts + SEGMENT_MIN_AFTER_SEC), len(samples)) - 1
        i_roll_end = max(i_first, bisect.bisect_left(ts_list, end_ts) - 1)
    else:
        for k in range(i_last_td + 1, len(samples)):
            s = samples[k]
            if s.ts - touchdowns[-1].ts < SEGMENT_MIN_AFTER_SEC:
                continue
            if s.on_ground and s.gs_kt < ROLLOUT_END_KT or s.ts - touchdowns[-1].ts > SEGMENT_MAX_AFTER_SEC:
                i1 = k
                break
        i_roll_end = i1

    rollout = [s for s in samples[i_first : i_roll_end + 1] if s.on_ground]
    # Wheels-on-ground AGL reading (the CG sits a few feet up) and an AGL
    # fallback for dumps that predate the channel.
    ground_agl = statistics.median(s.agl_ft for s in rollout) if rollout else 0.0
    have_agl = any(s.agl_ft > 0 for s in samples[i0 : i1 + 1])
    ground_alt = statistics.median(s.alt_ft for s in rollout) if rollout else first.alt_ft

    def agl(s: Sample) -> float:
        return s.agl_ft - ground_agl if have_agl else s.alt_ft - ground_alt

    have_true_hdg = any(s.heading_true_deg for s in samples[i0 : i1 + 1])
    have_gear = any(max(s.cp0_pct, s.cp1_pct, s.cp2_pct) > GEAR_COMPRESSION_MIN_PCT for s in samples[i0 : i1 + 1])

    picked = _pick_uniform(times, i0, i1, SEGMENT_MAX_POINTS)
    t_td = times[i_first]
    series: dict = {"t": [], "agl": [], "vs": [], "ias": [], "g": [], "bank": [], "x": [], "d": []}
    if have_true_hdg:
        series["hdg"] = []
    for i in picked:
        s = samples[i]
        along, cross = frame.project(s.lat, s.lon)
        series["t"].append(round(times[i] - t_td, 2))
        series["agl"].append(round(agl(s), 1))
        series["vs"].append(round(s.world_vs_fpm if s.world_vs_fpm else s.vs_fpm))
        series["ias"].append(round(s.ias_kt))
        series["g"].append(round(s.g_force, 2))
        series["bank"].append(round(_bank_right(s.bank_deg), 1))
        series["x"].append(round(cross))
        series["d"].append(round(along))
        if have_true_hdg:
            series["hdg"].append(round(s.heading_true_deg))

    def gear_first(i: int) -> str | None:
        if not have_gear:
            return None
        start = bisect.bisect_left(ts_list, samples[i].ts - 1.0)
        stop = bisect.bisect_right(ts_list, samples[i].ts + 0.5)
        for s in samples[start:stop]:
            hit = [
                s.cp0_pct > GEAR_COMPRESSION_MIN_PCT,
                s.cp1_pct > GEAR_COMPRESSION_MIN_PCT,
                s.cp2_pct > GEAR_COMPRESSION_MIN_PCT,
            ]
            if not any(hit):
                continue
            if hit[0] and not (hit[1] or hit[2]):
                return "nose"
            if hit[1] and hit[2]:
                return "all" if hit[0] else "mains"
            return "left" if hit[1] else "right"
        return None

    td_records = []
    for td in touchdowns:
        i = idx_at(td.ts)
        s = samples[i]
        # Last airborne sample before this touchdown carries the arrival
        # attitude and speed; the sim's latches (fresh at sample i) win when
        # they hold a value.
        la = next((j for j in range(i - 1, max(i0 - 1, -1), -1) if not samples[j].on_ground), None)
        arrive = samples[la] if la is not None else s
        course = _course_into(samples, i)
        heading = s.td_heading_deg if s.td_heading_deg else (arrive.heading_true_deg or None)
        crab = _angle_diff(heading, course) if heading is not None and course is not None else None
        bank = s.td_bank_deg if s.td_bank_deg else (arrive.bank_deg or None)
        pitch = s.td_pitch_deg if s.td_pitch_deg else (arrive.pitch_deg or None)
        g_start = bisect.bisect_left(ts_list, td.ts - 1.0)
        g_stop = bisect.bisect_right(ts_list, td.ts + 1.0)
        g_values = [x.g_force for x in samples[g_start:g_stop] if x.g_force]
        along, cross = frame.project(s.lat, s.lon)
        td_records.append(
            {
                "t": round(times[i] - t_td, 2),
                "fpm": td.rate_fpm,
                "sensorFpm": -round(td.sensor_fpm) if td.sensor_fpm > 0 else None,
                "vsFpm": _r(td.vs_fpm),
                "worldVsFpm": _r(td.world_vs_fpm) if td.world_vs_fpm else None,
                "g": _r(max(g_values), 2) if g_values else None,
                "bankDeg": _r(_bank_right(bank), 1) if bank is not None else None,
                "pitchDeg": _r(_pitch_up(pitch), 1) if pitch is not None else None,
                "crabDeg": _r(crab, 1),
                "driftKt": _r(arrive.lateral_kt, 1) if arrive.lateral_kt else None,
                "iasKt": round(arrive.ias_kt),
                "gsKt": round(s.gs_kt),
                "x": round(cross),
                "d": round(along),
                "gear": gear_first(i),
            }
        )

    # Rollout quality: worst centerline offset and heading excursion while
    # still rolling fast enough for either to mean anything.
    fast_rollout = [
        (k, s) for k, s in enumerate(samples) if i_first <= k <= i_roll_end and s.on_ground and s.gs_kt >= ROLLOUT_END_KT
    ]
    centerline_max = max((abs(frame.project(s.lat, s.lon)[1]) for _, s in fast_rollout), default=None)
    heading_max: float | None = None
    for k, s in fast_rollout:
        if have_true_hdg:
            dev = abs(_angle_diff(s.heading_true_deg, frame.axis_deg))
        else:
            course = _course_into(samples, k, min_sec=0.5)
            if course is None:
                continue
            dev = abs(_angle_diff(course, frame.axis_deg))
        heading_max = dev if heading_max is None else max(heading_max, dev)

    # Float: time from the last pass down through ten feet to the wheels.
    float_sec = None
    for j in range(i_first - 1, i0 - 1, -1):
        if agl(samples[j]) > FLOAT_AGL_FT:
            float_sec = times[i_first] - times[j]
            break

    return {
        "kind": event.kind,
        "touchdownT": round(t_td, 1),
        "liftoffT": round(times[min(bisect.bisect_left(ts_list, end_ts), len(samples) - 1)] - t_td, 1) if end_ts else None,
        **series,
        "touchdowns": td_records,
        "runway": (
            {
                "ident": runway.ident,
                "headingDeg": round(runway.heading_deg),
                "lengthFt": round(runway.length_ft),
                "widthFt": round(runway.width_ft),
            }
            if runway
            else None
        ),
        "touchdownFt": td_records[0]["d"] if runway else None,
        "centerlineMaxFt": _r(centerline_max),
        "headingMaxDeg": _r(heading_max),
        "floatSec": _r(float_sec, 1),
        "gearFirst": td_records[0]["gear"],
    }
