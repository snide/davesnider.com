"""Assemble the ingest payload for a finished flight."""

from __future__ import annotations

import math

from flight_recorder.detector import Flight
from flight_recorder.enrich import Enrichment
from flight_recorder.geo import haversine_nm
from flight_recorder.simplify import simplify_track

# Uniform time-downsampled series for the card's charts. Separate from the
# Douglas-Peucker track: DP preserves geometry, which would happily drop a
# speed spike.
CHANNEL_MAX_POINTS = 180


def build_channels(flight: Flight) -> dict:
    samples = flight.samples
    step = max(1, math.ceil(len(samples) / CHANNEL_MAX_POINTS))
    picked = samples[::step]
    if picked[-1] is not samples[-1]:
        picked.append(samples[-1])
    return {
        "t": [round(s.ts - flight.departure_ts) for s in picked],
        "ias": [round(s.ias_kt) for s in picked],
        "gs": [round(s.gs_kt) for s in picked],
        "windKt": [round(s.wind_kt) for s in picked],
        "windDir": [round(s.wind_dir_deg) for s in picked],
        "inCloud": [int(s.in_cloud) for s in picked],
        "rpm": [round(s.rpm) for s in picked],
        "fuelFlow": [round(s.fuel_flow_gph, 1) for s in picked],
        "fuel": [round(s.fuel_gal, 1) for s in picked],
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
    track = simplify_track(flight.samples, flight.departure_ts)

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
        "durationSec": int(flight.arrival_ts - flight.departure_ts),
        "distanceNm": round(distance),
        "maxAltitudeFt": round(max(s.alt_ft for s in flight.samples)),
        "landingRateFpm": flight.landing_rate_fpm,
        "routeString": enrichment.route_string,
        "track": track,
        "channels": build_channels(flight),
        "fuelBurnedGal": stats.get("fuelBurnedGal"),
        "maxG": stats.get("maxG"),
        "avgHeadwindKt": stats.get("avgHeadwindKt"),
    }
