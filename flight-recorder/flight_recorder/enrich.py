"""Flight enrichment: SimBrief OFP match, else nearest-airport lookup.

SimBrief is a one-shot unauthenticated web API — nothing needs to be running on
the PC. The OurAirports database is downloaded once and cached.
"""

from __future__ import annotations

import csv
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from flight_recorder.geo import bearing_deg, haversine_nm

log = logging.getLogger(__name__)

SIMBRIEF_URL = "https://www.simbrief.com/api/xml.fetcher.php"
SIMBRIEF_MAX_AGE_SEC = 12 * 3600
SIMBRIEF_AIRPORT_MATCH_NM = 5.0

OURAIRPORTS_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv"
OURAIRPORTS_RUNWAYS_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/runways.csv"
AIRPORT_TYPES = {"large_airport", "medium_airport", "small_airport", "seaplane_base"}
# A landing farther than this from any field is off-airport: a lake, a bush
# strip, a road. Seaplane bases are small and their coordinates are the dock,
# so water gets its own, tighter radius.
OFF_AIRPORT_NM = 10.0
WATER_BASE_NM = 3.0
# How far to look for a town to name an off-airport landing after
NEAREST_TOWN_NM = 30.0


@dataclass
class Enrichment:
    origin_icao: str
    origin_name: str | None
    dest_icao: str
    dest_name: str | None
    aircraft_icao: str | None
    route_string: str | None


@dataclass
class Airport:
    icao: str
    name: str
    lat: float
    lon: float
    kind: str = "small_airport"  # OurAirports type
    municipality: str = ""


class AirportIndex:
    def __init__(self, cache_dir: Path):
        self._cache = cache_dir / "airports.csv"
        self._airports: list[Airport] | None = None

    def _load(self) -> list[Airport]:
        if self._airports is not None:
            return self._airports
        if not self._cache.exists():
            log.info("downloading OurAirports database")
            resp = httpx.get(OURAIRPORTS_URL, timeout=60, follow_redirects=True)
            resp.raise_for_status()
            self._cache.parent.mkdir(parents=True, exist_ok=True)
            self._cache.write_text(resp.text, encoding="utf-8")
        airports = []
        with self._cache.open(encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row["type"] not in AIRPORT_TYPES or not row["ident"]:
                    continue
                try:
                    airports.append(
                        Airport(
                            icao=row["ident"],
                            name=row["name"],
                            lat=float(row["latitude_deg"]),
                            lon=float(row["longitude_deg"]),
                            kind=row["type"],
                            municipality=row.get("municipality") or "",
                        )
                    )
                except ValueError:
                    continue
        self._airports = airports
        return airports

    def nearest(
        self, lat: float, lon: float, max_nm: float | None = None, kinds: set[str] | None = None
    ) -> Airport | None:
        best, best_dist = None, float("inf")
        for airport in self._load():
            if kinds is not None and airport.kind not in kinds:
                continue
            # Cheap prefilter: 1 degree of latitude is 60 nm.
            if abs(airport.lat - lat) > 1.5:
                continue
            d = haversine_nm(lat, lon, airport.lat, airport.lon)
            if d < best_dist:
                best, best_dist = airport, d
        if best is not None and max_nm is not None and best_dist > max_nm:
            return None
        return best

    def place(self, lat: float, lon: float, water: bool) -> tuple[str, str | None]:
        """(ident, name) for where a flight began or ended. On water: the
        seaplane base within WATER_BASE_NM, else any field that close, else
        "WATER" named after the nearest town. On land: the nearest field
        within OFF_AIRPORT_NM, else "OFF" (a bush strip, a road) likewise."""
        if water:
            base = self.nearest(lat, lon, WATER_BASE_NM, {"seaplane_base"}) or self.nearest(lat, lon, WATER_BASE_NM)
            if base:
                return base.icao, base.name
            return "WATER", f"water near {self._town(lat, lon)}"
        field = self.nearest(lat, lon, OFF_AIRPORT_NM)
        if field:
            return field.icao, field.name
        return "OFF", f"off-airport near {self._town(lat, lon)}"

    def _town(self, lat: float, lon: float) -> str:
        near = self.nearest(lat, lon, NEAREST_TOWN_NM)
        if near and near.municipality:
            return near.municipality
        if near:
            return near.name
        return f"{lat:.2f}, {lon:.2f}"


@dataclass
class RunwayEnd:
    """One landing direction of a runway: the threshold you cross and the
    true heading you roll out on."""

    ident: str  # "27L"
    lat: float
    lon: float
    heading_deg: float  # true
    length_ft: float
    width_ft: float
    displaced_ft: float  # displaced threshold, along the runway from the end coordinates


class RunwayIndex:
    """OurAirports runways.csv, downloaded once and cached beside airports.csv.
    Both ends of every runway with coordinates become a RunwayEnd — closed
    ones included: the database tracks the real world and the sim's scenery
    lags it (KPWK 6/24 is closed in OurAirports but MSFS 2024 still draws
    it, and the 2026-09-21 Duke landing on 24 went unmatched). The matcher
    only picks a runway the aircraft actually rolled down, so a closed one
    can't steal a landing from an open one. A missing published heading is
    computed from the two ends."""

    def __init__(self, cache_dir: Path):
        self._cache = cache_dir / "runways.csv"
        self._by_airport: dict[str, list[RunwayEnd]] | None = None

    def _load(self) -> dict[str, list[RunwayEnd]]:
        if self._by_airport is not None:
            return self._by_airport
        if not self._cache.exists():
            log.info("downloading OurAirports runway database")
            resp = httpx.get(OURAIRPORTS_RUNWAYS_URL, timeout=60, follow_redirects=True)
            resp.raise_for_status()
            self._cache.parent.mkdir(parents=True, exist_ok=True)
            self._cache.write_text(resp.text, encoding="utf-8")
        by_airport: dict[str, list[RunwayEnd]] = {}
        with self._cache.open(encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                ends = _runway_ends(row)
                if ends:
                    by_airport.setdefault(row["airport_ident"], []).extend(ends)
        self._by_airport = by_airport
        return by_airport

    def for_airport(self, ident: str | None) -> list[RunwayEnd]:
        if not ident:
            return []
        try:
            return self._load().get(ident, [])
        except Exception:
            log.warning("runway lookup failed for %s", ident, exc_info=True)
            return []


class SimRunwayCache:
    """Runway geometry the recorder pulled from the sim itself, kept in
    `<home>/sim_runways.json` by ident so replays (Linux too, given the file)
    use the runway MSFS drew rather than the database's — at KO69 they are
    36 ft apart."""

    def __init__(self, home: Path):
        self._path = home / "sim_runways.json"
        self._data: dict[str, list[dict]] | None = None

    def _load(self) -> dict[str, list[dict]]:
        if self._data is None:
            try:
                self._data = json.loads(self._path.read_text(encoding="utf-8")) if self._path.exists() else {}
            except Exception:
                log.warning("unreadable %s; starting a new cache", self._path)
                self._data = {}
        return self._data

    def get(self, ident: str | None) -> list[RunwayEnd] | None:
        if not ident:
            return None
        rows = self._load().get(ident)
        return [RunwayEnd(**row) for row in rows] if rows else None

    def put(self, ident: str, ends: list[RunwayEnd]) -> None:
        data = self._load()
        data[ident] = [end.__dict__ for end in ends]
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(data, indent=1), encoding="utf-8")


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except ValueError:
        return None


def _runway_ends(row: dict) -> list[RunwayEnd]:
    length = _float(row.get("length_ft")) or 0.0
    width = _float(row.get("width_ft")) or 0.0
    coords = {}
    for side in ("le", "he"):
        lat, lon = _float(row.get(f"{side}_latitude_deg")), _float(row.get(f"{side}_longitude_deg"))
        if lat is not None and lon is not None:
            coords[side] = (lat, lon)
    ends = []
    for side, other in (("le", "he"), ("he", "le")):
        if side not in coords or not row.get(f"{side}_ident"):
            continue
        # The published heading, with the bearing between the two ends as the
        # fallback. Tried the other way round: at KO69 the ends' bearing is
        # 306.4° while the published 305° matches the heading the aircraft
        # actually rolled out on, so the end coordinates are the less
        # trustworthy of the two there.
        heading = _float(row.get(f"{side}_heading_degT"))
        if heading is None and other in coords:
            heading = bearing_deg(*coords[side], *coords[other])
        if heading is None:
            continue
        ends.append(
            RunwayEnd(
                ident=row[f"{side}_ident"],
                lat=coords[side][0],
                lon=coords[side][1],
                heading_deg=heading % 360.0,
                length_ft=length,
                width_ft=width,
                displaced_ft=_float(row.get(f"{side}_displaced_threshold_ft")) or 0.0,
            )
        )
    return ends


def fetch_simbrief_ofp(username: str) -> dict | None:
    try:
        resp = httpx.get(SIMBRIEF_URL, params={"username": username, "json": "1"}, timeout=30)
        if resp.status_code == 400:
            # SimBrief's answer for "no OFP generated for this user" —
            # routine when flying without a dispatched plan.
            log.info("SimBrief: no flight plan on file; using nearest-airport lookup")
            return None
        resp.raise_for_status()
        return resp.json()
    except Exception:
        log.warning("SimBrief fetch failed", exc_info=True)
        return None


def _airport_from_ofp(section: dict) -> tuple[str | None, str | None, float | None, float | None]:
    icao = section.get("icao_code") or None
    name = section.get("name") or None
    try:
        lat, lon = float(section["pos_lat"]), float(section["pos_long"])
    except (KeyError, TypeError, ValueError):
        lat = lon = None
    return icao, name, lat, lon


def enrich(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    simbrief_username: str | None,
    airports: AirportIndex,
    start_water: bool = False,
    end_water: bool = False,
) -> Enrichment:
    """Prefer a recent SimBrief OFP whose airports sit where we actually took
    off and landed; otherwise fall back to nearest-airport lookups."""
    if simbrief_username:
        ofp = fetch_simbrief_ofp(simbrief_username)
        if ofp:
            try:
                generated = float(ofp.get("params", {}).get("time_generated", 0))
            except (TypeError, ValueError):
                generated = 0
            o_icao, o_name, o_lat, o_lon = _airport_from_ofp(ofp.get("origin", {}))
            d_icao, d_name, d_lat, d_lon = _airport_from_ofp(ofp.get("destination", {}))
            fresh = time.time() - generated < SIMBRIEF_MAX_AGE_SEC
            positions_known = None not in (o_lat, o_lon, d_lat, d_lon)
            if (
                fresh
                and o_icao
                and d_icao
                and positions_known
                and haversine_nm(start_lat, start_lon, o_lat, o_lon) < SIMBRIEF_AIRPORT_MATCH_NM
                and haversine_nm(end_lat, end_lon, d_lat, d_lon) < SIMBRIEF_AIRPORT_MATCH_NM
            ):
                aircraft = ofp.get("aircraft", {}).get("icaocode") or None
                route = ofp.get("general", {}).get("route") or None
                return Enrichment(o_icao, o_name, d_icao, d_name, aircraft, route)
            log.info("SimBrief OFP found but did not match this flight")

    origin_icao, origin_name = airports.place(start_lat, start_lon, start_water)
    dest_icao, dest_name = airports.place(end_lat, end_lon, end_water)
    return Enrichment(
        origin_icao=origin_icao,
        origin_name=origin_name,
        dest_icao=dest_icao,
        dest_name=dest_name,
        aircraft_icao=None,
        route_string=None,
    )
