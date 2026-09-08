"""Assemble the ingest payload for a finished flight."""

from __future__ import annotations

import math

from flight_recorder.detector import Flight
from flight_recorder.enrich import Enrichment
from flight_recorder.geo import haversine_nm
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


def build_channels(flight: Flight, times: list[float]) -> dict:
    samples = flight.samples
    step = max(1, math.ceil(len(samples) / CHANNEL_MAX_POINTS))
    indices = list(range(0, len(samples), step))
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
        "rpm": [round(s.rpm) for s in picked],
        "fuelFlow": [round(s.fuel_flow_gph, 1) for s in picked],
        "fuel": [round(s.fuel_gal, 1) for s in picked],
        # Terrain elevation under the flight; 0 when AGL was unavailable
        "ground": [max(0, round(s.alt_ft - s.agl_ft)) if s.agl_ft > 0 else 0 for s in picked],
    }


def headwind_component_kt(sample) -> float:
    """Signed headwind (positive = headwind) from wind vector vs heading."""
    angle = math.radians(sample.wind_dir_deg - sample.heading_deg)
    return sample.wind_kt * math.cos(angle)


def build_stats(flight: Flight) -> dict:
    airborne = [s for s in flight.samples if not s.on_ground]
    stats: dict = {}

    fuel = [s.fuel_gal for s in flight.samples if s.fuel_gal > 0]
    if fuel:
        burned = fuel[0] - fuel[-1]
        # A mid-flight refuel makes the diff meaningless; report nothing.
        if burned >= 0:
            stats["fuelBurnedGal"] = round(burned, 1)

    g_values = [s.g_force for s in flight.samples if s.g_force != 0]
    if g_values:
        stats["maxG"] = round(max(g_values), 2)

    winds = [s for s in airborne if s.wind_kt > 0]
    if winds:
        stats["avgHeadwindKt"] = round(sum(headwind_component_kt(s) for s in winds) / len(winds))

    return stats


def build_item(flight: Flight, enrichment: Enrichment, aircraft_title: str | None) -> dict:
    times, pauses = flight_times(flight.samples, zero_ts=flight.departure_ts)
    track = simplify_track(flight.samples, times)

    def t_at(ts: float) -> float:
        i = min(range(len(flight.samples)), key=lambda j: abs(flight.samples[j].ts - ts))
        return times[i]

    distance = 0.0
    for a, b in zip(track, track[1:]):
        distance += haversine_nm(a[0], a[1], b[0], b[1])

    stats = build_stats(flight)

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
        "durationSec": max(1, round(t_at(flight.arrival_ts) - t_at(flight.departure_ts))),
        "distanceNm": round(distance),
        "maxAltitudeFt": round(max(s.alt_ft for s in flight.samples)),
        "landingRateFpm": flight.landing_rate_fpm,
        "routeString": enrichment.route_string,
        "track": track,
        "channels": build_channels(flight, times),
        "pauses": pauses,
        "fuelBurnedGal": stats.get("fuelBurnedGal"),
        "maxG": stats.get("maxG"),
        "avgHeadwindKt": stats.get("avgHeadwindKt"),
    }
