"""Telemetry sources: live SimConnect (Windows) and CSV replay (anywhere).

The live source talks to SimConnect through the Python-SimConnect wrapper's
connection but not through its per-variable `Request` objects: those cost a
round trip plus a 10 ms (15.6 ms on Windows) sleep EACH, so ~35 variables
made every poll take most of a second and the "10 Hz near the ground" never
happened (the 2026-09-14 pattern flight sampled at ~1 Hz). Instead ONE data
definition holds every variable with an explicit unit, the sim pushes the
whole struct every sim frame, and the poll just reads the latest copy.

The same connection answers runway geometry requests (facility data), which
is how the landing frame gets the runway the sim actually drew rather than
the OurAirports database's idea of it (36 ft apart at KO69).

Everything SimConnect-specific is Windows-only and untestable here; the
pure parts — the variable table, struct decoding, facility-message parsing,
runway-end geometry — are plain functions with tests.
"""

from __future__ import annotations

import logging
import math
import struct
import sys
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from flight_recorder.enrich import RunwayEnd
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
# The pushed struct is older than this -> the sim stopped sending (menu,
# loading screen); the poll yields nothing rather than a frozen sample.
BATCH_STALE_SEC = 2.0
TITLE_REFRESH_SEC = 5.0
FACILITY_TIMEOUT_SEC = 4.0
DEFINE_RETRY_SEC = 5.0

# The wrapper bundles an old SimConnect.dll without the facility API. A
# newer one (any MSFS SDK) is a drop-in for everything the wrapper calls and
# adds RequestFacilityData. Explicit SIMCONNECT_DLL wins, then the SDKs'
# usual homes; the bundled one is the fallback (runways then come from the
# OurAirports database).
SDK_DLL_PARTS = ("SimConnect SDK", "lib", "SimConnect.dll")
SDK_ENV_VARS = ("MSFS2024_SDK", "MSFS_SDK")
SDK_DEFAULT_DIRS = (r"C:\MSFS 2024 SDK", r"C:\MSFS SDK")


def find_simconnect_dll() -> str | None:
    """Path of a SimConnect.dll newer than the wrapper's, or None."""
    import os  # noqa: PLC0415

    explicit = os.environ.get("SIMCONNECT_DLL")
    if explicit:
        return explicit if Path(explicit).is_file() else None
    bases = [os.environ.get(env) for env in SDK_ENV_VARS] + list(SDK_DEFAULT_DIRS)
    for base in bases:
        if not base:
            continue
        path = Path(base).joinpath(*SDK_DLL_PARTS)
        if path.is_file():
            return str(path)
    return None

# The batched data definition: (Sample field, simvar, units). Order is the
# struct order. Units are requested explicitly so SimConnect converts —
# no radians-vs-degrees guessing on our side (the wrapper's own unit table
# was the source of the ×60 and radians incidents).
SIMVARS: list[tuple[str, bytes, bytes]] = [
    ("lat", b"PLANE LATITUDE", b"degrees"),
    ("lon", b"PLANE LONGITUDE", b"degrees"),
    ("alt_ft", b"PLANE ALTITUDE", b"feet"),
    ("gs_kt", b"GROUND VELOCITY", b"knots"),
    ("vs_fpm", b"VERTICAL SPEED", b"feet per minute"),
    ("on_ground", b"SIM ON GROUND", b"bool"),
    ("ias_kt", b"AIRSPEED INDICATED", b"knots"),
    ("tas_kt", b"AIRSPEED TRUE", b"knots"),
    ("heading_deg", b"PLANE HEADING DEGREES MAGNETIC", b"degrees"),
    ("wind_dir_deg", b"AMBIENT WIND DIRECTION", b"degrees"),
    ("wind_kt", b"AMBIENT WIND VELOCITY", b"knots"),
    ("oat_c", b"AMBIENT TEMPERATURE", b"celsius"),
    ("in_cloud", b"AMBIENT IN CLOUD", b"bool"),
    ("fuel_gal", b"FUEL TOTAL QUANTITY", b"gallons"),
    ("g_force", b"G FORCE", b"gforce"),
    ("touchdown_fpm", b"PLANE TOUCHDOWN NORMAL VELOCITY", b"feet per minute"),
    ("rpm", b"GENERAL ENG RPM:1", b"rpm"),
    ("fuel_flow_gph", b"ENG FUEL FLOW GPH:1", b"gallons per hour"),
    ("agl_ft", b"PLANE ALT ABOVE GROUND", b"feet"),
    ("bank_deg", b"PLANE BANK DEGREES", b"degrees"),
    ("pitch_deg", b"PLANE PITCH DEGREES", b"degrees"),
    ("heading_true_deg", b"PLANE HEADING DEGREES TRUE", b"degrees"),
    ("lateral_kt", b"VELOCITY BODY X", b"knots"),
    ("world_vs_fpm", b"VELOCITY WORLD Y", b"feet per minute"),
    ("td_bank_deg", b"PLANE TOUCHDOWN BANK DEGREES", b"degrees"),
    ("td_pitch_deg", b"PLANE TOUCHDOWN PITCH DEGREES", b"degrees"),
    ("td_heading_deg", b"PLANE TOUCHDOWN HEADING DEGREES TRUE", b"degrees"),
    ("td_lat", b"PLANE TOUCHDOWN LATITUDE", b"degrees"),
    ("td_lon", b"PLANE TOUCHDOWN LONGITUDE", b"degrees"),
    ("cp0_pct", b"CONTACT POINT COMPRESSION:0", b"percent"),
    ("cp1_pct", b"CONTACT POINT COMPRESSION:1", b"percent"),
    ("cp2_pct", b"CONTACT POINT COMPRESSION:2", b"percent"),
]
REQUIRED_FIELDS = ("lat", "lon", "alt_ft", "gs_kt", "vs_fpm", "on_ground")
BOOL_FIELDS = ("on_ground", "in_cloud")
ANGLE_FIELDS = ("heading_deg", "heading_true_deg", "td_heading_deg")

# SimConnect constants the wrapper's enums lack (MSFS SDK values)
RECV_ID_SIMOBJECT_DATA = 8
RECV_ID_FACILITY_DATA = 28
RECV_ID_FACILITY_DATA_END = 29
FACILITY_DATA_TYPE_RUNWAY = 1
# VISUAL_FRAME keeps pushing while the sim is paused (frozen values the
# gate drops, as before); SIM_FRAME would go silent and trip the watchdog.
PERIOD_VISUAL_FRAME = 2
FT_PER_M = 3.28084

# Facility definition for a runway, in this exact order: the sim packs the
# fields back to back, and FACILITY_RUNWAY_STRUCT below decodes them. All
# the 8-byte fields first so nothing depends on padding rules. Displaced
# thresholds are child sections in the SDK (OPEN PRIMARY_THRESHOLD …), not
# runway fields — asking for them as fields got an END with no data.
FACILITY_RUNWAY_FIELDS: list[tuple[bytes, str]] = [
    (b"LATITUDE", "d"),
    (b"LONGITUDE", "d"),
    (b"ALTITUDE", "d"),
    (b"HEADING", "f"),
    (b"LENGTH", "f"),
    (b"WIDTH", "f"),
    (b"PRIMARY_NUMBER", "i"),
    (b"PRIMARY_DESIGNATOR", "i"),
    (b"SECONDARY_NUMBER", "i"),
    (b"SECONDARY_DESIGNATOR", "i"),
]
FACILITY_RUNWAY_STRUCT = "<" + "".join(fmt for _, fmt in FACILITY_RUNWAY_FIELDS)
FACILITY_HEADER_STRUCT = "<10I"  # SIMCONNECT_RECV (3) + UserRequestId, UniqueRequestId, ParentUniqueRequestId, Type, IsListItem, ItemIndex, ListSize
FACILITY_HEADER_SIZE = struct.calcsize(FACILITY_HEADER_STRUCT)
RUNWAY_DESIGNATORS = {0: "", 1: "L", 2: "R", 3: "C", 4: "W", 5: "A", 6: "B"}
RUNWAY_COMPASS_NUMBERS = {37: "N", 38: "NE", 39: "E", 40: "SE", 41: "S", 42: "SW", 43: "W", 44: "NW"}


def decode_batch(values: tuple[float, ...] | list[float], fields: list[str], ts: float) -> Sample | None:
    """One pushed struct -> a Sample. None for the menus (lat/lon 0,0) or a
    struct missing a required field (a rebuilt definition dropped it)."""
    if len(values) != len(fields):
        return None
    raw = dict(zip(fields, values))
    if any(name not in raw for name in REQUIRED_FIELDS):
        return None
    # Menus park the "aircraft" on the equator (0,0 or 0,90 seen)
    if abs(raw["lat"]) < 0.01:
        return None
    kwargs: dict = {"ts": ts}
    for name, value in raw.items():
        if name in BOOL_FIELDS:
            kwargs[name] = value >= 0.5
        elif name in ANGLE_FIELDS:
            kwargs[name] = value % 360.0
        else:
            kwargs[name] = float(value)
    return Sample(**kwargs)


@dataclass
class FacilityRunway:
    """One runway as the sim describes it: centre point, primary heading,
    dimensions in feet, displaced thresholds, and both idents."""

    lat: float
    lon: float
    heading_deg: float  # true, primary end
    length_ft: float
    width_ft: float
    primary_ident: str
    secondary_ident: str
    primary_threshold_ft: float = 0.0
    secondary_threshold_ft: float = 0.0


def runway_ident(number: int, designator: int) -> str:
    if number in RUNWAY_COMPASS_NUMBERS:
        return RUNWAY_COMPASS_NUMBERS[number]
    return f"{number:02d}{RUNWAY_DESIGNATORS.get(designator, '')}"


def parse_facility_message(buf: bytes, request_id: int) -> FacilityRunway | None:
    """A SIMCONNECT_RECV_FACILITY_DATA message -> a runway, or None when it
    is for another request, another facility type, or too short to hold the
    fields we defined."""
    if len(buf) < FACILITY_HEADER_SIZE + struct.calcsize(FACILITY_RUNWAY_STRUCT):
        return None
    header = struct.unpack_from(FACILITY_HEADER_STRUCT, buf, 0)
    user_request, ftype = header[3], header[6]
    if user_request != request_id or ftype != FACILITY_DATA_TYPE_RUNWAY:
        return None
    lat, lon, _alt, heading, length_m, width_m, p_num, p_des, s_num, s_des = struct.unpack_from(
        FACILITY_RUNWAY_STRUCT, buf, FACILITY_HEADER_SIZE
    )
    return FacilityRunway(
        lat=lat,
        lon=lon,
        heading_deg=heading % 360.0,
        length_ft=length_m * FT_PER_M,
        width_ft=width_m * FT_PER_M,
        primary_ident=runway_ident(p_num, p_des),
        secondary_ident=runway_ident(s_num, s_des),
    )


def describe_facility_message(buf: bytes) -> str:
    """One line per message for the log when a request yields no runways:
    the header words and the first bytes of the payload."""
    if len(buf) < FACILITY_HEADER_SIZE:
        return f"short message ({len(buf)} bytes): {buf.hex()}"
    h = struct.unpack_from(FACILITY_HEADER_STRUCT, buf, 0)
    payload = buf[FACILITY_HEADER_SIZE : FACILITY_HEADER_SIZE + 72]
    return (
        f"size={h[0]} req={h[3]} type={h[6]} list={h[7]} item={h[8]}/{h[9]} "
        f"payload[{len(buf) - FACILITY_HEADER_SIZE}]={payload.hex()}"
    )


def _offset(lat: float, lon: float, heading_deg: float, dist_ft: float) -> tuple[float, float]:
    """Move a point `dist_ft` along a true heading (flat earth; runways are
    short)."""
    a = math.radians(heading_deg)
    dlat = dist_ft * math.cos(a) / (60.0 * 6076.12)
    dlon = dist_ft * math.sin(a) / (60.0 * 6076.12 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


def runway_ends_from_facility(runway: FacilityRunway) -> list[RunwayEnd]:
    """Both landing directions of a sim runway. The primary end's threshold
    is half a length back from the centre along the primary heading; the
    secondary end is the mirror image."""
    if not (200.0 <= runway.length_ft <= 20000.0 and 20.0 <= runway.width_ft <= 500.0):
        return []
    half = runway.length_ft / 2.0
    p_lat, p_lon = _offset(runway.lat, runway.lon, runway.heading_deg, -half)
    s_heading = (runway.heading_deg + 180.0) % 360.0
    s_lat, s_lon = _offset(runway.lat, runway.lon, runway.heading_deg, half)
    ends = []
    for ident, lat, lon, heading, displaced in (
        (runway.primary_ident, p_lat, p_lon, runway.heading_deg, runway.primary_threshold_ft),
        (runway.secondary_ident, s_lat, s_lon, s_heading, runway.secondary_threshold_ft),
    ):
        if not ident:
            continue
        ends.append(
            RunwayEnd(
                ident=ident,
                lat=lat,
                lon=lon,
                heading_deg=heading,
                length_ft=runway.length_ft,
                width_ft=runway.width_ft,
                displaced_ft=displaced if displaced < half else 0.0,
            )
        )
    return ends


def icao_candidates(ident: str) -> list[str]:
    """The sim keys US fields without an ICAO code by their FAA id (O69,
    W29); OurAirports prefixes some of those with K (KO69). Try both."""
    out = [ident]
    if len(ident) == 4 and ident[0] == "K" and any(c.isdigit() for c in ident[1:]):
        out.append(ident[1:])
    return out


class ReplaySource:
    """Replays a raw-sample CSV as fast as possible (dev loop on Linux)."""

    def __init__(self, path: Path):
        self._path = path
        self.aircraft_title: str | None = None

    def samples(self) -> Iterator[Sample]:
        yield from read_samples(self._path)

    def runway_ends(self, icao: str, near: tuple[float, float] | None = None) -> list[RunwayEnd] | None:
        """A replay has no live connection, but if the sim happens to be
        running (Windows), borrow one just long enough to ask for the
        runways — so a reprocessed flight gets the sim's geometry too."""
        if sys.platform != "win32":
            return None
        try:
            sim = _make_recorder_simconnect_class()(find_simconnect_dll())
        except Exception:
            return None  # sim not running
        try:
            return FacilityClient(sim).runway_ends(icao, near)
        finally:
            try:
                sim.exit()
            except Exception:
                pass


def poll_interval(sample: Sample | None) -> float:
    if sample is None:
        return POLL_INTERVAL_SEC
    near_ground = not sample.on_ground and 0 < sample.agl_ft < FAST_POLL_AGL_FT
    rolling = sample.on_ground and sample.gs_kt > FAST_POLL_GS_KT
    return FAST_POLL_INTERVAL_SEC if near_ground or rolling else POLL_INTERVAL_SEC


def _make_recorder_simconnect_class():
    """Built lazily: the wrapper only imports on Windows."""
    from ctypes import POINTER, c_double, cast, string_at  # noqa: PLC0415
    from SimConnect import SimConnect  # type: ignore[import-not-found]  # noqa: PLC0415
    from SimConnect.Enum import SIMCONNECT_RECV_SIMOBJECT_DATA  # type: ignore[import-not-found]  # noqa: PLC0415

    class RecorderSimConnect(SimConnect):
        """The wrapper's connection plus: the batched struct, facility data,
        and exception tracking for the batch definition."""

        def __init__(self, library_path: str | None = None) -> None:
            # Dispatch can fire during super().__init__ (it connects), so
            # every attribute the override touches exists first.
            self.batch_request_id: int | None = None
            self.batch_count = 0
            self.batch_send_ids: dict[int, str] = {}
            self.batch_failed: set[str] = set()
            self.latest: tuple[float, ...] | None = None
            self.latest_at = 0.0
            self.facility_request_id: int | None = None
            self.facility_runways: list[FacilityRunway] = []
            self.facility_raw: list[str] = []  # header + first bytes of every message, for the log
            self.facility_send_ids: dict[int, str] = {}
            self.facility_done = False
            if library_path:
                super().__init__(library_path=library_path)
            else:
                super().__init__()
            self.facility_supported = hasattr(self.dll.SimConnect, "SimConnect_AddToFacilityDefinition")

        def my_dispatch_proc(self, pData, cbData, pContext):
            try:
                dwID = pData.contents.dwID
                if dwID == RECV_ID_SIMOBJECT_DATA:
                    obj = cast(pData, POINTER(SIMCONNECT_RECV_SIMOBJECT_DATA)).contents
                    if self.batch_request_id is not None and obj.dwRequestID == self.batch_request_id and self.batch_count:
                        values = cast(obj.dwData, POINTER(c_double * self.batch_count)).contents
                        self.latest = tuple(values)
                        self.latest_at = time.time()
                    return
                if dwID == RECV_ID_FACILITY_DATA:
                    if self.facility_request_id is not None:
                        buf = string_at(pData, cbData)
                        self.facility_raw.append(describe_facility_message(buf))
                        runway = parse_facility_message(buf, self.facility_request_id)
                        if runway is not None:
                            self.facility_runways.append(runway)
                    return
                if dwID == RECV_ID_FACILITY_DATA_END:
                    self.facility_done = True
                    return
            except Exception:  # never let the callback raise into ctypes
                log.exception("dispatch failed")
                return
            try:
                super().my_dispatch_proc(pData, cbData, pContext)
            except Exception:
                # The wrapper's fallthrough builds its RECV_ID enum from the
                # message id and raises on ids newer than its table (27+).
                pass

        def handle_exception_event(self, exc):
            field = self.batch_send_ids.get(exc.dwSendID)
            if field is not None:
                log.warning("simvar for %s rejected by the sim (exception %d); dropping it from the batch", field, exc.dwException)
                self.batch_failed.add(field)
                return
            call = self.facility_send_ids.get(exc.dwSendID)
            if call is not None:
                log.warning("facility call %s rejected by the sim (exception %d, index %d)", call, exc.dwException, exc.dwIndex)
                return
            super().handle_exception_event(exc)

    return RecorderSimConnect


class SimConnectSource:
    """Live telemetry via one batched SimConnect data definition. Windows only.

    Blocks until the sim is available, reconnects when it goes away, and
    yields one sample per second while connected (10 per second near the
    ground — see poll_interval).
    """

    def __init__(self) -> None:
        if sys.platform != "win32":
            raise RuntimeError("SimConnect is only available on Windows; use --replay elsewhere")
        self.aircraft_title: str | None = None
        self._sim = None
        self._requests = None
        self._fields: list[str] = []
        self._def_id = None

    # ---- connection -------------------------------------------------------

    def _bind(self, name: str, argtypes: list):
        return _bind(self._sim, name, argtypes)

    def _define_batch(self) -> None:
        """(Re)build the data definition with every simvar the sim hasn't
        rejected, and ask for it every visual frame."""
        from ctypes.wintypes import DWORD, HANDLE  # noqa: PLC0415
        from SimConnect.Enum import SIMCONNECT_DATATYPE  # type: ignore[import-not-found]  # noqa: PLC0415

        sim = self._sim
        if self._def_id is None:
            self._def_id = sim.new_def_id()
        else:
            self._bind("ClearDataDefinition", [HANDLE, DWORD])(sim.hSimConnect, self._def_id.value)
        request_id = sim.new_request_id()
        sim.batch_request_id = None
        sim.batch_send_ids = {}
        fields = [f for f in SIMVARS if f[0] not in sim.batch_failed]
        for name, simvar, unit in fields:
            sim.dll.AddToDataDefinition(
                sim.hSimConnect,
                self._def_id.value,
                simvar,
                unit,
                SIMCONNECT_DATATYPE.SIMCONNECT_DATATYPE_FLOAT64,
                0,
                0xFFFFFFFF,
            )
            sent = DWORD(0)
            sim.dll.GetLastSentPacketID(sim.hSimConnect, sent)
            sim.batch_send_ids[sent.value] = name
        self._fields = [f[0] for f in fields]
        sim.batch_count = len(fields)
        sim.latest = None
        sim.batch_request_id = request_id.value
        request = self._bind(
            "RequestDataOnSimObject", [HANDLE, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD]
        )
        request(sim.hSimConnect, request_id.value, self._def_id.value, 0, PERIOD_VISUAL_FRAME, 0, 0, 0, 0)
        log.info("batched %d simvars into one data definition", len(fields))

    def samples(self) -> Iterator[Sample | None]:
        """Yields samples while connected; yields a single None marker when
        telemetry stops (sim closed, back to menu) so the consumer can
        finalize a flight instead of waiting forever."""
        from SimConnect import AircraftRequests  # type: ignore[import-not-found]  # noqa: PLC0415

        recorder_class = _make_recorder_simconnect_class()
        dll_path = find_simconnect_dll()
        while True:
            try:
                self._sim = recorder_class(dll_path)
            except Exception:
                time.sleep(RECONNECT_INTERVAL_SEC)
                continue
            log.info("connected to simulator via %s", dll_path or "the wrapper's bundled SimConnect.dll")
            if not self._sim.facility_supported:
                log.warning(
                    "this SimConnect.dll has no facility API: runways come from the OurAirports database. "
                    "Install the MSFS SDK or set SIMCONNECT_DLL to its SimConnect SDK\\lib\\SimConnect.dll"
                )
            self._requests = AircraftRequests(self._sim, _time=0)
            self._def_id = None
            receiving = False
            stale_since: float | None = None
            title_at = 0.0
            try:
                # At the main menu the data request fails (E_FAIL) until an
                # aircraft exists; keep the connection and try again.
                waiting_logged = False
                while True:
                    try:
                        self._define_batch()
                        break
                    except OSError:
                        if not waiting_logged:
                            log.info("sim has no aircraft loaded yet; waiting")
                            waiting_logged = True
                        time.sleep(DEFINE_RETRY_SEC)
                while True:
                    sim = self._sim
                    if sim.batch_failed and any(f in self._fields for f in sim.batch_failed):
                        self._define_batch()
                    sample = self._poll()
                    now = time.time()
                    if sample is None:
                        if stale_since is None:
                            stale_since = now
                        elif now - stale_since > STALE_RECONNECT_SEC:
                            raise TimeoutError(f"no telemetry for {int(now - stale_since)}s; recycling the connection")
                    else:
                        stale_since = None
                        if now - title_at > TITLE_REFRESH_SEC:
                            title_at = now
                            self._refresh_title()
                        if not receiving:
                            receiving = True
                            log.info(
                                "receiving telemetry (lat=%.4f lon=%.4f alt=%.0fft)", sample.lat, sample.lon, sample.alt_ft
                            )
                        yield sample
                    time.sleep(poll_interval(sample))
            except Exception as exc:
                log.warning("simulator connection error (%s: %s); reconnecting", type(exc).__name__, exc)
                yield None
                try:
                    self._sim.exit()
                except Exception:
                    pass
                self._sim = None
                time.sleep(RECONNECT_INTERVAL_SEC)

    def _poll(self) -> Sample | None:
        sim = self._sim
        values = sim.latest
        if values is None or time.time() - sim.latest_at > BATCH_STALE_SEC:
            return None
        return decode_batch(values, self._fields, time.time())

    def _refresh_title(self) -> None:
        # The one string we need; the wrapper's round-trip path is fine at
        # once every few seconds.
        try:
            title = self._requests.get("TITLE")
        except Exception:
            return
        if isinstance(title, bytes):
            title = title.decode("utf-8", errors="replace")
        if title:
            self.aircraft_title = str(title)

    # ---- runway geometry from the sim --------------------------------------

    def runway_ends(self, icao: str, near: tuple[float, float] | None = None) -> list[RunwayEnd] | None:
        if self._sim is None:
            return None
        return FacilityClient(self._sim).runway_ends(icao, near)


def _bind(sim, name: str, argtypes: list):
    from ctypes import HRESULT  # noqa: PLC0415

    fn = getattr(sim.dll.SimConnect, f"SimConnect_{name}")
    fn.restype = HRESULT
    fn.argtypes = argtypes
    return fn


class FacilityClient:
    """Runway geometry over an open RecorderSimConnect connection. Results
    are cached on the connection object for the session."""

    def __init__(self, sim) -> None:
        self._sim = sim
        if not hasattr(sim, "runway_cache"):
            sim.runway_cache = {}

    def runway_ends(self, icao: str, near: tuple[float, float] | None = None) -> list[RunwayEnd] | None:
        """The airport's runways as the sim has them, or None when this DLL
        lacks the facility API / the sim doesn't know the ident / it doesn't
        answer in time. `near` (lat, lon) rejects an answer for some other
        airport."""
        sim = self._sim
        if not getattr(sim, "facility_supported", False):
            return None
        if icao in sim.runway_cache:
            return sim.runway_cache[icao]
        try:
            for candidate in icao_candidates(icao):
                runways = self._request(candidate)
                ends = [end for rw in runways for end in runway_ends_from_facility(rw)]
                if near is not None:
                    from flight_recorder.geo import haversine_nm  # noqa: PLC0415

                    ends = [e for e in ends if haversine_nm(e.lat, e.lon, near[0], near[1]) < 3.0]
                if ends:
                    log.info("sim runways for %s: %s", candidate, ", ".join(e.ident for e in ends))
                    sim.runway_cache[icao] = ends
                    return ends
        except Exception:
            log.warning("facility request for %s failed", icao, exc_info=True)
        return None

    def _request(self, icao: str) -> list[FacilityRunway]:
        from ctypes import c_char_p  # noqa: PLC0415
        from ctypes.wintypes import DWORD, HANDLE  # noqa: PLC0415

        sim = self._sim
        if getattr(sim, "facility_def_id", None) is None:
            add = _bind(sim, "AddToFacilityDefinition", [HANDLE, DWORD, c_char_p])
            def_id = sim.new_def_id()
            fields = [
                b"OPEN AIRPORT",
                b"LATITUDE",
                b"LONGITUDE",
                b"OPEN RUNWAY",
                *(name for name, _ in FACILITY_RUNWAY_FIELDS),
                b"CLOSE RUNWAY",
                b"CLOSE AIRPORT",
            ]
            sent = DWORD(0)
            for field in fields:
                add(sim.hSimConnect, def_id.value, field)
                sim.dll.GetLastSentPacketID(sim.hSimConnect, sent)
                sim.facility_send_ids[sent.value] = f"AddToFacilityDefinition({field.decode()})"
            sim.facility_def_id = def_id
        request_id = sim.new_request_id()
        sim.facility_runways = []
        sim.facility_raw = []
        sim.facility_done = False
        sim.facility_request_id = request_id.value
        _bind(sim, "RequestFacilityData", [HANDLE, DWORD, DWORD, c_char_p, c_char_p])(
            sim.hSimConnect, sim.facility_def_id.value, request_id.value, icao.encode(), b""
        )
        sent = DWORD(0)
        sim.dll.GetLastSentPacketID(sim.hSimConnect, sent)
        sim.facility_send_ids[sent.value] = f"RequestFacilityData({icao})"
        deadline = time.time() + FACILITY_TIMEOUT_SEC
        while not sim.facility_done and time.time() < deadline:
            time.sleep(0.02)
        time.sleep(0.05)  # let a trailing message land before we look
        runways = list(sim.facility_runways)
        sim.facility_request_id = None
        if not sim.facility_done:
            log.info("facility request for %s timed out", icao)
        elif not runways:
            # The sim answered but nothing parsed as a runway: dump what came
            # back so the field layout can be fixed from the log.
            log.info("facility request for %s answered with %d message(s) but no runway parsed", icao, len(sim.facility_raw))
            for line in sim.facility_raw[:12]:
                log.info("  facility message: %s", line)
        return runways
