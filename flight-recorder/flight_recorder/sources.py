"""Telemetry sources: live SimConnect (Windows) and CSV replay (anywhere)."""

from __future__ import annotations

import logging
import math
import sys
import time
from collections.abc import Iterator
from pathlib import Path

from flight_recorder.telemetry import Sample, read_samples

log = logging.getLogger(__name__)

POLL_INTERVAL_SEC = 1.0
# Near the ground the poll steps up to 10 Hz: a bounce can be over in well
# under a second, and at 1 Hz it never shows up as an airborne sample and
# G-force misses the spike. Fast while airborne below FAST_POLL_AGL_FT (the
# flare, any skip) and while rolling on the ground above FAST_POLL_GS_KT
# (touchdown, rollout, takeoff roll); back to 1 Hz for taxi and cruise.
FAST_POLL_INTERVAL_SEC = 0.1
FAST_POLL_AGL_FT = 50.0
FAST_POLL_GS_KT = 30.0
RECONNECT_INTERVAL_SEC = 30.0
# Connected but yielding no valid samples for this long -> the connection is
# presumed stale (a SimConnect session opened at the MSFS main menu can bind
# dead variable requests that never recover) and gets recycled.
STALE_RECONNECT_SEC = 120.0

# Simvars missing from the Python-SimConnect wrapper's request list. The
# wrapper's `get` returns None for unknown names (it does not raise), which
# is how PLANE_TOUCHDOWN_NORMAL_VELOCITY silently read 0 for every flight
# before 2026-09-14 and the "landing rate" was really the last 1 Hz airborne
# VS sample. These are registered as custom Requests with explicit units.
# Contact point 0 is the nose/tail wheel, 1 and 2 the mains.
CUSTOM_SIMVARS: dict[str, tuple[bytes, bytes]] = {
    "PLANE_TOUCHDOWN_NORMAL_VELOCITY": (b"PLANE TOUCHDOWN NORMAL VELOCITY", b"Feet per minute"),
    "PLANE_TOUCHDOWN_BANK_DEGREES": (b"PLANE TOUCHDOWN BANK DEGREES", b"Degrees"),
    "PLANE_TOUCHDOWN_PITCH_DEGREES": (b"PLANE TOUCHDOWN PITCH DEGREES", b"Degrees"),
    "PLANE_TOUCHDOWN_HEADING_DEGREES_TRUE": (b"PLANE TOUCHDOWN HEADING DEGREES TRUE", b"Degrees"),
    "PLANE_TOUCHDOWN_LATITUDE": (b"PLANE TOUCHDOWN LATITUDE", b"Degrees"),
    "PLANE_TOUCHDOWN_LONGITUDE": (b"PLANE TOUCHDOWN LONGITUDE", b"Degrees"),
    "CONTACT_POINT_COMPRESSION:0": (b"CONTACT POINT COMPRESSION:0", b"Percent"),
    "CONTACT_POINT_COMPRESSION:1": (b"CONTACT POINT COMPRESSION:1", b"Percent"),
    "CONTACT_POINT_COMPRESSION:2": (b"CONTACT POINT COMPRESSION:2", b"Percent"),
}
FPS_TO_KT = 0.592484


class ReplaySource:
    """Replays a raw-sample CSV as fast as possible (dev loop on Linux)."""

    def __init__(self, path: Path):
        self._path = path
        self.aircraft_title: str | None = None

    def samples(self) -> Iterator[Sample]:
        yield from read_samples(self._path)


def poll_interval(sample: Sample | None) -> float:
    if sample is None:
        return POLL_INTERVAL_SEC
    near_ground = not sample.on_ground and 0 < sample.agl_ft < FAST_POLL_AGL_FT
    rolling = sample.on_ground and sample.gs_kt > FAST_POLL_GS_KT
    return FAST_POLL_INTERVAL_SEC if near_ground or rolling else POLL_INTERVAL_SEC


class SimConnectSource:
    """Live polling via the Python-SimConnect wrapper. Windows only.

    Blocks until the sim is available, reconnects when it goes away, and
    yields one sample per second while connected (10 per second near the
    ground — see poll_interval).
    """

    def __init__(self) -> None:
        if sys.platform != "win32":
            raise RuntimeError("SimConnect is only available on Windows; use --replay elsewhere")
        self.aircraft_title: str | None = None
        # Simvars the wrapper raised on — asked once, then skipped. The wrapper
        # throws for names missing from its request list, and one bad extended
        # channel must never stall the whole sampler.
        self._unsupported: set[str] = set()
        self._custom: dict[str, object] = {}
        self._receiving = False

    def samples(self) -> Iterator[Sample | None]:
        """Yields samples while connected; yields a single None marker when
        telemetry stops (sim closed, back to menu) so the consumer can
        finalize a flight instead of waiting forever."""
        from SimConnect import AircraftRequests, SimConnect  # type: ignore[import-not-found]

        while True:
            try:
                sim = SimConnect()
            except Exception:
                time.sleep(RECONNECT_INTERVAL_SEC)
                continue
            log.info("connected to simulator")
            requests = AircraftRequests(sim, _time=0)
            self._custom = {}  # data definitions belong to this connection
            stale_since: float | None = None
            try:
                while True:
                    sample = self._poll(sim, requests)
                    if sample is None:
                        now = time.time()
                        if stale_since is None:
                            stale_since = now
                        elif now - stale_since > STALE_RECONNECT_SEC:
                            raise TimeoutError(
                                f"no telemetry for {int(now - stale_since)}s; recycling the connection"
                            )
                    else:
                        stale_since = None
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
                    time.sleep(poll_interval(sample))
            except Exception as exc:
                self._receiving = False
                log.warning("simulator connection error (%s: %s); reconnecting", type(exc).__name__, exc)
                yield None
                try:
                    sim.exit()
                except Exception:
                    pass
                time.sleep(RECONNECT_INTERVAL_SEC)

    def _custom_request(self, sim, name: str):
        request = self._custom.get(name)
        if request is None:
            from SimConnect.RequestList import Request  # type: ignore[import-not-found]

            request = Request(CUSTOM_SIMVARS[name], sim, _time=0)
            self._custom[name] = request
        return request

    def _poll(self, sim, requests) -> Sample | None:
        def get(name: str):
            if name in self._unsupported:
                return None
            try:
                if name in CUSTOM_SIMVARS:
                    return self._custom_request(sim, name).value
                if requests.find(name) is None:
                    # Not in the wrapper's list: it would return None forever
                    # and read as a silent 0 — say so once, then skip it.
                    log.warning("simvar %s is not in the SimConnect wrapper's request list; disabling it", name)
                    self._unsupported.add(name)
                    return None
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
            # The wrapper returns this in radians (verified against a real
            # dump: 2.22 rad = 127° = the departure runway heading).
            heading_deg=math.degrees(get_f("PLANE_HEADING_DEGREES_MAGNETIC")) % 360.0,
            wind_dir_deg=get_f("AMBIENT_WIND_DIRECTION"),
            wind_kt=get_f("AMBIENT_WIND_VELOCITY"),
            oat_c=get_f("AMBIENT_TEMPERATURE"),
            # Read as-is; first real dump showed 1 throughout a hazy night
            # flight — check a clear-day dump before trusting it.
            in_cloud=bool(get("AMBIENT_IN_CLOUD") or False),
            fuel_gal=get_f("FUEL_TOTAL_QUANTITY"),
            g_force=get_f("G_FORCE"),
            touchdown_fpm=get_f("PLANE_TOUCHDOWN_NORMAL_VELOCITY"),
            rpm=get_f("GENERAL_ENG_RPM:1"),
            fuel_flow_gph=get_f("ENG_FUEL_FLOW_GPH:1"),
            agl_ft=get_f("PLANE_ALT_ABOVE_GROUND"),
            # Attitude comes back in radians like the heading does. Signs are
            # the sim's own; landing.py interprets them.
            bank_deg=math.degrees(get_f("PLANE_BANK_DEGREES")),
            pitch_deg=math.degrees(get_f("PLANE_PITCH_DEGREES")),
            heading_true_deg=math.degrees(get_f("PLANE_HEADING_DEGREES_TRUE")) % 360.0,
            lateral_kt=get_f("VELOCITY_BODY_X") * FPS_TO_KT,
            world_vs_fpm=get_f("VELOCITY_WORLD_Y") * 60.0,
            # Custom requests ask for degrees / ft/min directly.
            td_bank_deg=get_f("PLANE_TOUCHDOWN_BANK_DEGREES"),
            td_pitch_deg=get_f("PLANE_TOUCHDOWN_PITCH_DEGREES"),
            td_heading_deg=get_f("PLANE_TOUCHDOWN_HEADING_DEGREES_TRUE") % 360.0,
            td_lat=get_f("PLANE_TOUCHDOWN_LATITUDE"),
            td_lon=get_f("PLANE_TOUCHDOWN_LONGITUDE"),
            cp0_pct=get_f("CONTACT_POINT_COMPRESSION:0"),
            cp1_pct=get_f("CONTACT_POINT_COMPRESSION:1"),
            cp2_pct=get_f("CONTACT_POINT_COMPRESSION:2"),
        )
