"""Telemetry sources: live SimConnect (Windows) and CSV replay (anywhere)."""

from __future__ import annotations

import logging
import sys
import time
from collections.abc import Iterator
from pathlib import Path

from flight_recorder.telemetry import Sample, read_samples

log = logging.getLogger(__name__)

POLL_INTERVAL_SEC = 1.0
RECONNECT_INTERVAL_SEC = 30.0


class ReplaySource:
    """Replays a raw-sample CSV as fast as possible (dev loop on Linux)."""

    def __init__(self, path: Path):
        self._path = path
        self.aircraft_title: str | None = None

    def samples(self) -> Iterator[Sample]:
        yield from read_samples(self._path)


class SimConnectSource:
    """Live polling via the Python-SimConnect wrapper. Windows only.

    Blocks until the sim is available, reconnects when it goes away, and
    yields one sample per second while connected.
    """

    def __init__(self) -> None:
        if sys.platform != "win32":
            raise RuntimeError("SimConnect is only available on Windows; use --replay elsewhere")
        self.aircraft_title: str | None = None
        # Simvars the wrapper raised on — asked once, then skipped. The wrapper
        # throws for names missing from its request list, and one bad extended
        # channel must never stall the whole sampler.
        self._unsupported: set[str] = set()
        self._receiving = False

    def samples(self) -> Iterator[Sample]:
        from SimConnect import AircraftRequests, SimConnect  # type: ignore[import-not-found]

        while True:
            try:
                sim = SimConnect()
            except Exception:
                time.sleep(RECONNECT_INTERVAL_SEC)
                continue
            log.info("connected to simulator")
            requests = AircraftRequests(sim, _time=0)
            try:
                while True:
                    sample = self._poll(requests)
                    if sample is not None:
                        if not self._receiving:
                            self._receiving = True
                            log.info(
                                "receiving telemetry (lat=%.4f lon=%.4f alt=%.0fft)",
                                sample.lat,
                                sample.lon,
                                sample.alt_ft,
                            )
                        yield sample
                    time.sleep(POLL_INTERVAL_SEC)
            except Exception as exc:
                self._receiving = False
                log.warning("simulator connection error (%s: %s); reconnecting", type(exc).__name__, exc)
                try:
                    sim.exit()
                except Exception:
                    pass
                time.sleep(RECONNECT_INTERVAL_SEC)

    def _poll(self, requests) -> Sample | None:
        def get(name: str):
            if name in self._unsupported:
                return None
            try:
                return requests.get(name)
            except Exception as exc:
                log.warning("simvar %s unavailable (%s); disabling it", name, type(exc).__name__)
                self._unsupported.add(name)
                return None

        lat = get("PLANE_LATITUDE")
        lon = get("PLANE_LONGITUDE")
        alt = get("PLANE_ALTITUDE")
        gs = get("GROUND_VELOCITY")
        vs = get("VERTICAL_SPEED")  # feet per minute (per the wrapper's SIM def log)
        on_ground = get("SIM_ON_GROUND")
        if None in (lat, lon, alt, gs, vs, on_ground):
            return None
        # Menus/loading screens report 0,0 — never a real flight position.
        if abs(lat) < 0.01 and abs(lon) < 0.01:
            return None

        title = get("TITLE")
        if isinstance(title, bytes):
            title = title.decode("utf-8", errors="replace")
        if title:
            self.aircraft_title = str(title)

        # Extended channels: never let a missing one drop the sample.
        def get_f(name: str, default: float = 0.0) -> float:
            value = get(name)
            return float(value) if value is not None else default

        return Sample(
            ts=time.time(),
            lat=float(lat),
            lon=float(lon),
            alt_ft=float(alt),
            gs_kt=float(gs),
            vs_fpm=float(vs),
            on_ground=bool(on_ground),
            ias_kt=get_f("AIRSPEED_INDICATED"),
            tas_kt=get_f("AIRSPEED_TRUE"),
            # NOTE: verify against the first real dump whether the wrapper
            # returns degrees or radians here (expect 0-360 if degrees).
            heading_deg=get_f("PLANE_HEADING_DEGREES_MAGNETIC"),
            wind_dir_deg=get_f("AMBIENT_WIND_DIRECTION"),
            wind_kt=get_f("AMBIENT_WIND_VELOCITY"),
            oat_c=get_f("AMBIENT_TEMPERATURE"),
            in_cloud=bool(get("AMBIENT_IN_CLOUD") or False),
            fuel_gal=get_f("FUEL_TOTAL_QUANTITY"),
            g_force=get_f("G_FORCE"),
            touchdown_fpm=get_f("PLANE_TOUCHDOWN_NORMAL_VELOCITY"),
        )
