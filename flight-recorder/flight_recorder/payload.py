"""Assemble the ingest payload for a finished flight."""

from __future__ import annotations

import bisect
import math

from flight_recorder.detector import Flight
from flight_recorder.enrich import Enrichment, RunwayEnd
from flight_recorder.landing import build_landings
from flight_recorder.geo import bearing_deg, haversine_nm
from flight_recorder.simplify import simplify_track

# A gap beyond this between consecutive kept samples means the sim was paused
# (sampling is 1 Hz; the gate only drops short glitch streaks). Paused time is
# excised from the flight's time base and recorded as a pause marker.
PAUSE_GAP_SEC = 10.0


def flight_times(samples, zero_ts: float | None = None) -> tuple[list[float], list[dict]]:
    """Per-sample offsets on a compressed clock (pauses removed), plus the
    pauses as [{t: offset-when-it-happened, sec: wall-clock length}].

    `zero_ts` anchors t=0 (wheels-up): taxi-out samples get negative offsets,
    read as T- time on the card."""
    times = [0.0]
    pauses: list[dict] = []
    for prev, cur in zip(samples, samples[1:]):
        dt = cur.ts - prev.ts
        if dt > PAUSE_GAP_SEC:
            pauses.append({"t": round(times[-1]), "sec": round(dt - 1)})
            dt = 1.0
        times.append(times[-1] + dt)
    if zero_ts is not None:
        zero_i = min(range(len(samples)), key=lambda i: abs(samples[i].ts - zero_ts))
        offset = times[zero_i]
        times = [t - offset for t in times]
        for pause in pauses:
            pause["t"] = round(pause["t"] - offset)
    return times, pauses

# Uniform time-downsampled series for the card's charts. Separate from the
# Douglas-Peucker track: DP preserves geometry, which would happily drop a
# speed spike.
CHANNEL_MAX_POINTS = 180


# Fuel flow is derived from the fuel-quantity slope rather than read from
# ENG_FUEL_FLOW_GPH: A2A's Accu-Sim engines never drive that simvar (it sat
# at 0.3-2.9 "gph" through a 15 gph climb). Quantity has 0.1 gal resolution,
# so the window has to be wide for the derivative to mean anything: 300 s
# gives 1.2 gph steps. Windows are on the compressed clock, so an excised
# pause (fuel frozen) doesn't dilute the slope.
FUEL_FLOW_WINDOW_SEC = 300.0


def derived_fuel_flow_gph(samples, times: list[float], i: int) -> float:
    half = FUEL_FLOW_WINDOW_SEC / 2
    j0 = bisect.bisect_left(times, times[i] - half)
    j1 = bisect.bisect_right(times, times[i] + half) - 1
    if j1 <= j0 or samples[j0].fuel_gal <= 0 or samples[j1].fuel_gal <= 0:
        return 0.0
    dt_h = (times[j1] - times[j0]) / 3600.0
    if dt_h <= 0:
        return 0.0
    # A refuel shows as negative; that's not a burn rate.
    return max(0.0, (samples[j0].fuel_gal - samples[j1].fuel_gal) / dt_h)


def build_channels(flight: Flight, times: list[float]) -> dict:
    samples = flight.samples
    # Pick by TIME, not by index: the poll runs at 10 Hz near the ground, so
    # an index stride would pack the flare and starve the cruise.
    span = times[-1] - times[0]
    steps = min(CHANNEL_MAX_POINTS, len(samples))
    indices: list[int] = []
    for k in range(steps):
        target = times[0] + span * k / max(1, steps - 1)
        i = min(bisect.bisect_left(times, target), len(samples) - 1)
        if not indices or i != indices[-1]:
            indices.append(i)
    if indices[-1] != len(samples) - 1:
        indices.append(len(samples) - 1)
    picked = [samples[i] for i in indices]
    picked_t = [round(times[i]) for i in indices]
    return {
        "t": picked_t,
        "ias": [round(s.ias_kt) for s in picked],
        "gs": [round(s.gs_kt) for s in picked],
        "windKt": [round(s.wind_kt) for s in picked],
        "windDir": [round(s.wind_dir_deg) for s in picked],
        "inCloud": [int(s.in_cloud) for s in picked],
        "oat": [round(s.oat_c) for s in picked],
        "rpm": [round(s.rpm) for s in picked],
        "fuelFlow": [round(derived_fuel_flow_gph(samples, times, i), 1) for i in indices],
        "fuel": [round(s.fuel_gal, 1) for s in picked],
        # Terrain elevation under the flight; 0 when AGL was unavailable
        "ground": [max(0, round(s.alt_ft - s.agl_ft)) if s.agl_ft > 0 else 0 for s in picked],
    }


# Ground speed below which the position-derived course is noise (taxi
# turns, the touchdown roll) and the sample is left out of the wind average.
COURSE_MIN_GS_KT = 30.0


def headwind_component_kt(sample, course_deg: float) -> float:
    """Signed headwind (positive = headwind) from the wind vector vs the true
    ground course. AMBIENT_WIND_DIRECTION is degrees TRUE while the recorded
    heading is MAGNETIC, so comparing against heading skewed the component
    by the local variation (~14° in the northeast); the course from
    consecutive positions is true and needs no new simvar."""
    angle = math.radians(sample.wind_dir_deg - course_deg)
    return sample.wind_kt * math.cos(angle)


def airborne_courses(samples) -> list[tuple[object, float]]:
    """(sample, true course) pairs for airborne samples moving fast enough
    for the course to mean something."""
    out = []
    for prev, cur in zip(samples, samples[1:]):
        if cur.on_ground or cur.gs_kt < COURSE_MIN_GS_KT:
            continue
        if prev.lat == cur.lat and prev.lon == cur.lon:
            continue
        out.append((cur, bearing_deg(prev.lat, prev.lon, cur.lat, cur.lon)))
    return out


# Phase classification for the fuel breakdown. VS is smoothed over a window
# before thresholding so a bumpy cruise doesn't flicker into climb/descent.
PHASE_VS_WINDOW_SEC = 30.0
PHASE_VS_THRESHOLD_FPM = 300.0
FUEL_PHASES = ("taxi", "climb", "cruise", "descent")
# Below this TAS the still-air estimate divides by near-zero (touchdown roll,
# a stall-speed float); those samples are counted at their actual time.
WIND_COST_MIN_TAS_KT = 40.0


def classify_phases(samples, times: list[float]) -> list[str]:
    out: list[str] = []
    half = PHASE_VS_WINDOW_SEC / 2
    for i, s in enumerate(samples):
        if s.on_ground:
            out.append("taxi")
            continue
        j0 = bisect.bisect_left(times, times[i] - half)
        j1 = bisect.bisect_right(times, times[i] + half)
        window = [x.vs_fpm for x in samples[j0:j1] if not x.on_ground]
        vs = sum(window) / len(window) if window else s.vs_fpm
        if vs > PHASE_VS_THRESHOLD_FPM:
            out.append("climb")
        elif vs < -PHASE_VS_THRESHOLD_FPM:
            out.append("descent")
        else:
            out.append("cruise")
    return out


def build_fuel_phases(samples, times: list[float]) -> dict | None:
    """Time, fuel and distance per phase (taxi / climb / cruise / descent).

    Fuel is summed from per-sample quantity drops so a mid-flight refuel
    (negative drop) is ignored rather than poisoning a phase."""
    if not any(s.fuel_gal > 0 for s in samples):
        return None
    phases = classify_phases(samples, times)
    acc = {name: {"sec": 0.0, "gal": 0.0, "nm": 0.0} for name in FUEL_PHASES}
    for i in range(1, len(samples)):
        prev, cur = samples[i - 1], samples[i]
        dt = times[i] - times[i - 1]
        if dt <= 0:
            continue
        bucket = acc[phases[i]]
        bucket["sec"] += dt
        bucket["nm"] += cur.gs_kt * dt / 3600.0
        if prev.fuel_gal > 0 and cur.fuel_gal > 0:
            bucket["gal"] += max(0.0, prev.fuel_gal - cur.fuel_gal)
    return {
        name: {"sec": round(v["sec"]), "gal": round(v["gal"], 1), "nm": round(v["nm"], 1)}
        for name, v in acc.items()
    }


def wind_cost_sec(samples, times: list[float]) -> int | None:
    """Airborne time minus the still-air time for the same ground track
    (each second's ground distance covered at that second's TAS). Positive =
    the wind cost you time. None when TAS was never recorded."""
    airborne = 0.0
    still_air = 0.0
    seen_tas = False
    for i in range(1, len(samples)):
        s = samples[i]
        if s.on_ground:
            continue
        dt = times[i] - times[i - 1]
        if dt <= 0:
            continue
        airborne += dt
        if s.tas_kt > 0:
            seen_tas = True
        if s.tas_kt >= WIND_COST_MIN_TAS_KT:
            still_air += (s.gs_kt * dt) / s.tas_kt
        else:
            still_air += dt
    if not seen_tas or airborne <= 0:
        return None
    return round(airborne - still_air)


def build_stats(flight: Flight, times: list[float], flight_sec: int, distance_nm: float) -> dict:
    samples = flight.samples
    airborne = [s for s in samples if not s.on_ground]
    stats: dict = {}

    fuel = [s.fuel_gal for s in samples if s.fuel_gal > 0]
    if fuel:
        burned = fuel[0] - fuel[-1]
        # A mid-flight refuel makes the diff meaningless; report nothing.
        if burned >= 0:
            stats["fuelBurnedGal"] = round(burned, 1)
        # Burn rate and economy are for the flying part only: taxi fuel is in
        # the total but not in the flight time it would be divided by.
        airborne_fuel = [s.fuel_gal for s in airborne if s.fuel_gal > 0]
        if len(airborne_fuel) >= 2 and flight_sec > 0:
            flown = airborne_fuel[0] - airborne_fuel[-1]
            if flown > 0:
                stats["avgFuelFlowGph"] = round(flown / (flight_sec / 3600.0), 1)
                stats["nmPerGal"] = round(distance_nm / flown, 1)
        stats["fuelPhases"] = build_fuel_phases(samples, times)

    g_values = [s.g_force for s in samples if s.g_force != 0]
    if g_values:
        stats["maxG"] = round(max(g_values), 2)

    winds = [(s, course) for s, course in airborne_courses(samples) if s.wind_kt > 0]
    if winds:
        stats["avgHeadwindKt"] = round(sum(headwind_component_kt(s, c) for s, c in winds) / len(winds))
    stats["windCostSec"] = wind_cost_sec(samples, times)

    return stats


def build_item(
    flight: Flight,
    enrichment: Enrichment,
    aircraft_title: str | None,
    runway_ends: list[RunwayEnd] | None = None,
) -> dict:
    times, pauses = flight_times(flight.samples, zero_ts=flight.departure_ts)
    track = simplify_track(flight.samples, times)

    def t_at(ts: float) -> float:
        i = min(range(len(flight.samples)), key=lambda j: abs(flight.samples[j].ts - ts))
        return times[i]

    distance = 0.0
    for a, b in zip(track, track[1:]):
        distance += haversine_nm(a[0], a[1], b[0], b[1])

    duration_sec = max(1, round(t_at(flight.arrival_ts) - t_at(flight.departure_ts)))
    stats = build_stats(flight, times, duration_sec, distance)

    return {
        "externalId": str(int(flight.departure_ts)),
        "timestamp": int(flight.arrival_ts),
        "originIcao": enrichment.origin_icao,
        "originName": enrichment.origin_name,
        "destIcao": enrichment.dest_icao,
        "destName": enrichment.dest_name,
        "aircraftTitle": aircraft_title,
        "aircraftIcao": enrichment.aircraft_icao,
        "departureTs": int(flight.departure_ts),
        "arrivalTs": int(flight.arrival_ts),
        # Flying time on the compressed clock: wheels-up to wheels-down,
        # pauses excised, taxi excluded (the recording spans block time).
        "durationSec": duration_sec,
        "distanceNm": round(distance),
        "maxAltitudeFt": round(max(s.alt_ft for s in flight.samples)),
        "landingRateFpm": flight.landing_rate_fpm,
        "bounces": flight.bounces,
        "routeString": enrichment.route_string,
        "track": track,
        "channels": build_channels(flight, times),
        "pauses": pauses,
        "fuelBurnedGal": stats.get("fuelBurnedGal"),
        "maxG": stats.get("maxG"),
        "avgHeadwindKt": stats.get("avgHeadwindKt"),
        "avgFuelFlowGph": stats.get("avgFuelFlowGph"),
        "nmPerGal": stats.get("nmPerGal"),
        "fuelPhases": stats.get("fuelPhases"),
        "windCostSec": stats.get("windCostSec"),
        "landings": build_landings(flight, times, runway_ends),
    }
