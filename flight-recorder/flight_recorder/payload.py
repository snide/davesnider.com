"""Assemble the ingest payload for a finished flight."""

from __future__ import annotations

from flight_recorder.detector import Flight
from flight_recorder.enrich import Enrichment
from flight_recorder.geo import haversine_nm
from flight_recorder.simplify import simplify_track


def build_item(flight: Flight, enrichment: Enrichment, aircraft_title: str | None) -> dict:
    track = simplify_track(flight.samples, flight.departure_ts)

    distance = 0.0
    for a, b in zip(track, track[1:]):
        distance += haversine_nm(a[0], a[1], b[0], b[1])

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
    }
