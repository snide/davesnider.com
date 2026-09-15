"""The Linux-testable half of the SimConnect source: struct decoding,
facility-message parsing, runway geometry, the ident fallback and the
sim-runway cache."""

import math
import struct
from pathlib import Path

from flight_recorder.enrich import RunwayEnd, SimRunwayCache
from flight_recorder.geo import bearing_deg, haversine_nm
from flight_recorder.sources import (
    FACILITY_DATA_TYPE_RUNWAY,
    FACILITY_HEADER_STRUCT,
    FACILITY_RUNWAY_STRUCT,
    SIMVARS,
    FacilityRunway,
    decode_batch,
    icao_candidates,
    parse_facility_message,
    runway_ends_from_facility,
    runway_ident,
)


def test_decode_batch_maps_every_field_and_normalises():
    fields = [f[0] for f in SIMVARS]
    values = [0.0] * len(fields)
    idx = {name: i for i, name in enumerate(fields)}
    values[idx["lat"]] = 45.0
    values[idx["lon"]] = -122.0
    values[idx["alt_ft"]] = 1234.5
    values[idx["on_ground"]] = 1.0
    values[idx["in_cloud"]] = 0.0
    values[idx["heading_true_deg"]] = -10.0  # SimConnect can hand back a negative angle
    values[idx["cp1_pct"]] = 31.5
    sample = decode_batch(values, fields, ts=1.0)
    assert sample is not None
    assert sample.on_ground is True and sample.in_cloud is False
    assert sample.alt_ft == 1234.5 and sample.cp1_pct == 31.5
    assert sample.heading_true_deg == 350.0


def test_decode_batch_rejects_menus_and_mismatched_structs():
    fields = [f[0] for f in SIMVARS]
    assert decode_batch([0.0] * len(fields), fields, ts=1.0) is None  # lat/lon 0,0
    assert decode_batch([1.0] * (len(fields) - 1), fields, ts=1.0) is None


def test_decode_batch_after_a_dropped_field():
    fields = [f[0] for f in SIMVARS if f[0] != "cp2_pct"]
    values = [0.0] * len(fields)
    values[fields.index("lat")] = 45.0
    values[fields.index("lon")] = -122.0
    sample = decode_batch(values, fields, ts=1.0)
    assert sample is not None and sample.cp2_pct == 0.0  # dataclass default fills the gap


def _facility_message(request_id: int, ftype: int, payload: bytes) -> bytes:
    header = struct.pack(FACILITY_HEADER_STRUCT, 0, 0, 28, request_id, 7, 6, ftype, 1, 0, 1)
    return header + payload


def test_parse_facility_message_runway():
    payload = struct.pack(FACILITY_RUNWAY_STRUCT, 38.2578, -122.6055, 27.0, 305.0, 1097.28, 22.86, 29, 0, 11, 0)
    rw = parse_facility_message(_facility_message(42, FACILITY_DATA_TYPE_RUNWAY, payload), 42)
    assert rw is not None
    assert rw.primary_ident == "29" and rw.secondary_ident == "11"
    assert abs(rw.length_ft - 3600) < 1 and abs(rw.width_ft - 75) < 0.1
    assert rw.heading_deg == 305.0


def test_parse_facility_message_ignores_other_requests_types_and_short_buffers():
    payload = struct.pack(FACILITY_RUNWAY_STRUCT, 1, 2, 3, 4, 5, 6, 9, 0, 27, 0)
    assert parse_facility_message(_facility_message(41, FACILITY_DATA_TYPE_RUNWAY, payload), 42) is None
    assert parse_facility_message(_facility_message(42, 0, payload), 42) is None  # the airport record
    assert parse_facility_message(_facility_message(42, FACILITY_DATA_TYPE_RUNWAY, payload[:20]), 42) is None


def test_describe_facility_message_is_loggable():
    from flight_recorder.sources import describe_facility_message

    payload = struct.pack(FACILITY_RUNWAY_STRUCT, 1, 2, 3, 4, 5, 6, 9, 0, 27, 0)
    line = describe_facility_message(_facility_message(42, FACILITY_DATA_TYPE_RUNWAY, payload))
    assert line.startswith("size=0 req=42 type=1 list=1 item=0/1 payload[")
    assert describe_facility_message(b"\x01\x02").startswith("short message")


def test_runway_ident_designators_and_compass_names():
    assert runway_ident(9, 0) == "09"
    assert runway_ident(27, 1) == "27L"
    assert runway_ident(4, 3) == "04C"
    assert runway_ident(39, 0) == "E"


def test_runway_ends_from_facility_geometry():
    rw = FacilityRunway(38.2578, -122.6055, 305.0, 3600.0, 75.0, "29", "11", 0.0, 100.0)
    ends = runway_ends_from_facility(rw)
    assert [e.ident for e in ends] == ["29", "11"]
    p, s = ends
    # Each threshold sits half a length from the centre, in opposite directions
    assert abs(haversine_nm(p.lat, p.lon, rw.lat, rw.lon) * 6076.12 - 1800) < 2
    assert abs(haversine_nm(s.lat, s.lon, rw.lat, rw.lon) * 6076.12 - 1800) < 2
    # ...and the centre lies on the primary heading from the primary threshold
    assert abs(bearing_deg(p.lat, p.lon, rw.lat, rw.lon) - 305.0) < 0.2
    assert s.heading_deg == 125.0
    assert p.displaced_ft == 0.0 and abs(s.displaced_ft - 100.0) < 0.01
    assert p.width_ft == 75.0 and p.length_ft == 3600.0
    # Nonsense dimensions are refused rather than trusted
    assert runway_ends_from_facility(FacilityRunway(0, 0, 0, 5.0, 75.0, "01", "19")) == []


def test_icao_candidates_strips_the_k_from_faa_ids_only():
    assert icao_candidates("KO69") == ["KO69", "O69"]
    assert icao_candidates("W29") == ["W29"]
    assert icao_candidates("KSFO") == ["KSFO"]


def test_sim_runway_cache_round_trip(tmp_path: Path):
    cache = SimRunwayCache(tmp_path)
    assert cache.get("KO69") is None
    ends = [RunwayEnd("29", 38.2549, -122.6, 305.0, 3600.0, 75.0, 0.0), RunwayEnd("11", 38.2607, -122.61, 125.0, 3600.0, 75.0, 100.0)]
    cache.put("KO69", ends)
    again = SimRunwayCache(tmp_path).get("KO69")
    assert again == ends
    assert math.isclose(again[1].displaced_ft, 100.0)


def test_find_simconnect_dll_prefers_the_explicit_override(tmp_path: Path, monkeypatch):
    from flight_recorder.sources import find_simconnect_dll

    dll = tmp_path / "SimConnect.dll"
    monkeypatch.setenv("SIMCONNECT_DLL", str(dll))
    assert find_simconnect_dll() is None  # set but missing: don't guess
    dll.write_bytes(b"MZ")
    assert find_simconnect_dll() == str(dll)
    monkeypatch.delenv("SIMCONNECT_DLL")
    monkeypatch.setenv("MSFS_SDK", str(tmp_path / "sdk"))
    assert find_simconnect_dll() is None
    sdk_dll = tmp_path / "sdk" / "SimConnect SDK" / "lib" / "SimConnect.dll"
    sdk_dll.parent.mkdir(parents=True)
    sdk_dll.write_bytes(b"MZ")
    assert find_simconnect_dll() == str(sdk_dll)
