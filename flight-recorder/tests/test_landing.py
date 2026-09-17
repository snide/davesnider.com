"""Landing analysis on a synthetic 10 Hz approach: runway 27 at a fictional
field, a firm first touchdown, a one-second skip, a drift right on rollout."""

import csv
import io
import math

from flight_recorder.detector import FlightDetector
from flight_recorder.enrich import RunwayEnd, _runway_ends
from flight_recorder.landing import Frame, build_landing, build_landings, match_runway
from flight_recorder.payload import flight_times
from flight_recorder.telemetry import Sample
from tests.synthetic import T0

FT_PER_DEG_LAT = 60.0 * 6076.12
THRESHOLD = (45.0, -122.0)  # runway 27 threshold; runway runs west (270 true)
RUNWAY = RunwayEnd("27", THRESHOLD[0], THRESHOLD[1], 270.0, 4000.0, 75.0, 0.0)


def _at(along_ft: float, cross_ft: float) -> tuple[float, float]:
    """lat/lon for a point `along_ft` down runway 27 and `cross_ft` right of it."""
    lat0, lon0 = THRESHOLD
    # Heading 270: along = west, right of centerline = north
    lat = lat0 + cross_ft / FT_PER_DEG_LAT
    lon = lon0 - along_ft / (FT_PER_DEG_LAT * math.cos(math.radians(lat0)))
    return lat, lon


def build_landing_samples() -> list[Sample]:
    samples: list[Sample] = []
    t = T0
    # Taxi + takeoff + a short circuit: coarse, just enough for the detector
    for i in range(20):
        lat, lon = _at(200 + i * 10, 0)
        samples.append(Sample(t, lat, lon, 100.0, 12.0, 0.0, True, agl_ft=4.0))
        t += 1
    for i in range(120):
        lat, lon = _at(400 + i * 150, 0)
        samples.append(Sample(t, lat, lon, 100.0 + min(i, 60) * 20, 90.0, 800.0 if i < 60 else 0.0, False, agl_ft=1000.0))
        t += 1
    # Final approach: 45 s at 1 Hz then 10 Hz below 50 ft, 75 kt = 127 ft/s,
    # descending 500 fpm, crabbed 5° left, arriving 20 ft right of centerline
    # and 800 ft past the threshold. Airspeed bleeds, AGL from 300 ft.
    speed_fps = 127.0
    along = 800.0 - 300.0 / 500.0 * 60.0 * speed_fps  # where a 500 fpm descent from 300 ft begins
    agl = 300.0
    while agl > 50.0:
        lat, lon = _at(along, 20.0)
        samples.append(
            Sample(t, lat, lon, 100.0 + agl, 75.0, -500.0, False, ias_kt=75.0, agl_ft=agl, heading_true_deg=265.0,
                   bank_deg=0.0, pitch_deg=2.0, g_force=1.0, world_vs_fpm=-500.0)
        )
        t += 1
        along += speed_fps
        agl -= 500.0 / 60.0
    # 10 Hz: flare from 50 ft, descent easing to 200 fpm, one bank wobble
    vs = -500.0
    while agl > 4.0:
        vs = max(-500.0 + (50.0 - agl) * 8.0, -220.0)
        lat, lon = _at(along, 20.0)
        samples.append(
            Sample(t, lat, lon, 100.0 + agl, 72.0, vs, False, ias_kt=72.0, agl_ft=agl, heading_true_deg=265.0,
                   bank_deg=-3.0, pitch_deg=-4.0, g_force=1.05, world_vs_fpm=vs)
        )
        t += 0.1
        along += speed_fps * 0.1
        agl += vs / 600.0
    td_along = along
    # Touchdown: 0.8 s on the ground with a G spike and the sensor latched
    for k in range(8):
        lat, lon = _at(along, 20.0)
        samples.append(
            Sample(t, lat, lon, 100.0, 70.0, 0.0, True, ias_kt=70.0, agl_ft=4.0, heading_true_deg=268.0,
                   g_force=1.9 if k == 0 else 1.1, touchdown_fpm=340.0, td_lat=lat if k == 0 else samples[-1].td_lat,
                   td_lon=lon if k == 0 else samples[-1].td_lon, td_bank_deg=-3.0, td_pitch_deg=-4.0,
                   td_heading_deg=265.0, cp1_pct=30.0 if k > 0 else 20.0, cp2_pct=30.0 if k > 0 else 0.0)
        )
        t += 0.1
        along += 118.0 * 0.1
    # Skip: 0.6 s airborne to 3 ft, settle at 120 fpm
    for k in range(6):
        lat, lon = _at(along, 22.0)
        samples.append(Sample(t, lat, lon, 103.0, 68.0, -120.0 if k > 2 else 150.0, False, ias_kt=68.0, agl_ft=7.0,
                              heading_true_deg=268.0, g_force=0.9, touchdown_fpm=340.0, world_vs_fpm=-120.0 if k > 2 else 150.0))
        t += 0.1
        along += 115.0 * 0.1
    # Rollout: 25 s decelerating from 65 kt to 20 kt, drifting right to 35 ft
    # with a 6° heading excursion halfway.
    td_pos = _at(along, 24.0)
    gs = 65.0
    cross = 24.0
    k = 0
    while gs > 20.0:
        cross = min(35.0, cross + 0.05)
        lat, lon = _at(along, cross)
        hdg = 276.0 if 8.0 < k * 0.1 < 12.0 else 270.0
        samples.append(
            Sample(t, lat, lon, 100.0, gs, 0.0, True, ias_kt=gs, agl_ft=4.0, heading_true_deg=hdg, g_force=1.0,
                   touchdown_fpm=110.0, td_lat=td_pos[0], td_lon=td_pos[1], cp0_pct=25.0, cp1_pct=30.0, cp2_pct=30.0)
        )
        t += 0.1
        along += gs * 1.6878 * 0.1
        gs -= 0.18
        k += 1
    # Taxi at 1 Hz until the hold expires
    for i in range(140):
        lat, lon = _at(along + i * 15, 35.0)
        samples.append(Sample(t, lat, lon, 100.0, 9.0, 0.0, True, agl_ft=4.0, heading_true_deg=270.0,
                              touchdown_fpm=110.0, td_lat=td_pos[0], td_lon=td_pos[1], cp0_pct=25.0, cp1_pct=30.0, cp2_pct=30.0))
        t += 1
    return samples, td_along


def _detect():
    samples, td_along = build_landing_samples()
    detector = FlightDetector()
    flights = [f for s in samples if (f := detector.feed(s)) is not None]
    assert len(flights) == 1
    return flights[0], td_along


def test_frame_projection():
    frame = Frame(THRESHOLD[0], THRESHOLD[1], 270.0)
    along, cross = frame.project(*_at(1000.0, 30.0))
    assert abs(along - 1000.0) < 1.0
    assert abs(cross - 30.0) < 1.0


def test_match_runway_by_course_and_centerline():
    other = RunwayEnd("09", *_at(4000.0, 0.0), 90.0, 4000.0, 75.0, 0.0)
    lat, lon = _at(800.0, 20.0)
    assert match_runway([other, RUNWAY], lat, lon, 268.0) is RUNWAY
    assert match_runway([other, RUNWAY], lat, lon, 92.0) is other
    far = _at(800.0, 900.0)
    assert match_runway([RUNWAY], far[0], far[1], 270.0) is None


def test_runway_ends_from_csv_row_compute_missing_heading():
    rows = list(csv.DictReader(io.StringIO(
        "airport_ident,length_ft,width_ft,closed,le_ident,le_latitude_deg,le_longitude_deg,le_heading_degT,le_displaced_threshold_ft,"
        "he_ident,he_latitude_deg,he_longitude_deg,he_heading_degT,he_displaced_threshold_ft\n"
        "KXYZ,4000,75,0,09,45.0,-122.0,,,27,45.0,-121.98,,\n"
    )))
    ends = _runway_ends(rows[0])
    assert [e.ident for e in ends] == ["09", "27"]
    assert abs(ends[0].heading_deg - 90.0) < 1.0
    assert abs(ends[1].heading_deg - 270.0) < 1.0


def test_landing_record_on_runway():
    flight, td_along = _detect()
    assert flight.bounces == 1
    times, _ = flight_times(flight.samples, zero_ts=flight.departure_ts)
    landing = build_landing(flight, times, [RUNWAY])
    assert landing is not None
    assert landing["runway"]["ident"] == "27"
    # Touchdown 800-ish ft past the threshold, 20 ft right of centerline
    assert abs(landing["touchdownFt"] - td_along) < 15
    first, second = landing["touchdowns"]
    assert abs(first["x"] - 20) <= 2
    assert first["t"] == 0
    # Hardest reading: the sim's 340 sensor beats the ~220 fpm flare sample
    assert first["fpm"] == -340 and first["sensorFpm"] == -340
    assert first["g"] == 1.9
    # Crab: heading 265 into a 270 track = 5° nose-left
    assert first["crabDeg"] == -5.0
    # Sim bank -3 (right wing low in the believed convention) reads +3
    assert first["bankDeg"] == 3.0 and first["pitchDeg"] == 4.0
    assert first["gear"] == "left"
    assert first["iasKt"] == 72
    assert second["fpm"] == -120 and second["t"] > 0
    # Rollout drifted to ~35 ft right with a 6° heading excursion
    assert 30 <= landing["centerlineMaxFt"] <= 37
    assert landing["headingMaxDeg"] == 6
    assert landing["gearFirst"] == "left"
    assert landing["floatSec"] is not None and 0.5 < landing["floatSec"] < 6.0
    # Segment covers short final through the rollout, at 10 Hz where it matters
    n = len(landing["t"])
    assert n <= 600
    assert all(len(landing[k]) == n for k in ("agl", "vs", "ias", "g", "bank", "x", "d", "hdg"))
    assert landing["t"][0] < -30 and landing["t"][-1] > 20
    assert max(landing["agl"]) > 250
    assert min(landing["agl"][-50:]) >= -1  # wheels-on-ground reads as zero


def test_landing_without_runway_uses_approach_course():
    flight, td_along = _detect()
    times, _ = flight_times(flight.samples, zero_ts=flight.departure_ts)
    landing = build_landing(flight, times, [])
    assert landing["runway"] is None and landing["touchdownFt"] is None
    first = landing["touchdowns"][0]
    # Origin is the first touchdown; the frame axis is the approach course (west)
    assert first["x"] == 0 and first["d"] == 0
    assert landing["d"][-1] > 1000
    assert 10 <= landing["centerlineMaxFt"] <= 20  # 35 ft absolute, 15 relative to the arrival line


def build_pattern_samples() -> list[Sample]:
    """A touch-and-go on runway 27 (touchdown 1,200 ft in, 8 s roll drifting
    left, off again), a 90 s circuit, then the full-stop landing from
    build_landing_samples() spliced on afterwards."""
    speed_fps = 120.0
    samples: list[Sample] = []
    t = T0
    for i in range(20):
        lat, lon = _at(200 + i * 10, 0)
        samples.append(Sample(t, lat, lon, 100.0, 12.0, 0.0, True, agl_ft=4.0))
        t += 1
    for i in range(60):
        lat, lon = _at(400 + i * 150, 0)
        samples.append(Sample(t, lat, lon, 100.0 + min(i, 40) * 20, 90.0, 800.0 if i < 40 else 0.0, False, agl_ft=800.0))
        t += 1
    # Final for the touch-and-go: 200 ft down at 500 fpm, 10 Hz under 50 ft
    agl = 200.0
    along = 1200.0 - 200.0 / 500.0 * 60.0 * speed_fps
    while agl > 4.0:
        dt = 1.0 if agl > 50.0 else 0.1
        lat, lon = _at(along, -10.0)
        samples.append(Sample(t, lat, lon, 100.0 + agl, 71.0, -500.0, False, ias_kt=71.0, agl_ft=agl,
                              heading_true_deg=270.0, world_vs_fpm=-500.0, g_force=1.0))
        t += dt
        along += speed_fps * dt
        agl -= 500.0 / 60.0 * dt
    tg_along = along
    # 8 s ground roll at 10 Hz, drifting left to -30 ft, then power up and off
    for k in range(80):
        cross = -10.0 - k * 0.25
        lat, lon = _at(along, cross)
        samples.append(Sample(t, lat, lon, 100.0, 68.0, 0.0, True, ias_kt=68.0, agl_ft=4.0, heading_true_deg=268.0,
                              g_force=1.6 if k == 0 else 1.0, touchdown_fpm=260.0, cp1_pct=30.0, cp2_pct=30.0))
        t += 0.1
        along += 68.0 * 1.6878 * 0.1
    for k in range(60):
        lat, lon = _at(along + k * 130, -30.0)
        samples.append(Sample(t, lat, lon, 100.0 + k * 12, 78.0, 700.0, False, ias_kt=75.0, agl_ft=k * 12.0,
                              heading_true_deg=270.0, touchdown_fpm=260.0, world_vs_fpm=700.0, g_force=1.0))
        t += 1
    # Circuit back and the full stop: reuse the second half of the other
    # generator (from its final approach on), shifted in time.
    tail, td_along = build_landing_samples()
    cut = next(i for i, s in enumerate(tail) if not s.on_ground and s.agl_ft <= 300.0 and s.ias_kt == 75.0)
    offset = t + 30.0 - tail[cut].ts
    for s in tail[cut:]:
        s.ts += offset
        samples.append(s)
    return samples, tg_along, td_along


def test_pattern_work_yields_one_record_per_landing():
    samples, tg_along, td_along = build_pattern_samples()
    detector = FlightDetector()
    flights = [f for s in samples if (f := detector.feed(s)) is not None]
    assert len(flights) == 1
    flight = flights[0]
    assert [ev.kind for ev in flight.landings] == ["touchAndGo", "stop"]
    times, _ = flight_times(flight.samples, zero_ts=flight.departure_ts)
    records = build_landings(flight, times, [RUNWAY])
    assert [r["kind"] for r in records] == ["touchAndGo", "stop"]
    tg, stop = records
    assert tg["runway"]["ident"] == "27" and stop["runway"]["ident"] == "27"
    assert abs(tg["touchdownFt"] - tg_along) < 20
    # The synthetic final has no flare, so the -500 sample beats the sensor's 260
    assert tg["touchdowns"][0]["sensorFpm"] == -260 and tg["touchdowns"][0]["fpm"] == -500
    # The ground roll is the rollout: about eight seconds, ending ~30 ft left
    assert 7.5 <= tg["liftoffT"] <= 9.0
    assert 28 <= tg["centerlineMaxFt"] <= 32
    assert tg["t"][-1] > tg["liftoffT"]  # a few seconds of climb-out in the segment
    assert max(tg["agl"][-20:]) > 20  # ...and it is visibly climbing
    assert stop["liftoffT"] is None
    assert stop["touchdownT"] > tg["touchdownT"] + 60
    assert abs(stop["touchdownFt"] - td_along) < 15
    assert len(stop["touchdowns"]) == 2


def test_rollout_metrics_stop_at_the_turn_off():
    """A high-speed exit: heading eases right a degree a second and the track
    leaves the pavement while still fast. Neither the 40° nor the 150 ft
    belongs to the landing; the rollout ends where the turn began."""
    samples, td_along = build_landing_samples()
    turned = 0
    for s in samples:
        if s.on_ground and 25.0 < s.gs_kt <= 50.0 and s.ts > samples[0].ts + 200:
            turned += 1
            s.heading_true_deg = 270.0 + min(40.0, turned * 0.4)
            lat, lon = _at(td_along + 2200.0 + turned * 8.0, 35.0 + turned * 1.5)
            s.lat, s.lon = lat, lon
    assert turned > 20
    detector = FlightDetector()
    flight = [f for s in samples if (f := detector.feed(s)) is not None][0]
    times, _ = flight_times(flight.samples, zero_ts=flight.departure_ts)
    landing = build_landing(flight, times, [RUNWAY])
    assert landing["headingMaxDeg"] <= 8
    assert landing["centerlineMaxFt"] < 40
    assert landing["rolloutEndT"] is not None and landing["rolloutEndT"] < landing["t"][-1]


def test_a_swerve_that_returns_is_part_of_the_rollout():
    """Heading goes 14° off and comes back: that is the landing, not an exit."""
    from flight_recorder.landing import _turn_start

    devs = [1.0, 2.0, 6.0, 10.0, 14.0, 12.0, 8.0, 4.0, 2.0, 1.0, 0.0]
    assert _turn_start(devs) is None
    # ...but a ramp that never returns starts where it began to grow
    exit_ramp = [1.0, 0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 15.0, 25.0]
    assert _turn_start(exit_ramp) == 1
    # a swerve followed by a real exit: the exit is found, not the swerve
    both = [0.0, 10.0, 14.0, 3.0, 0.0, 1.0, 5.0, 9.0, 20.0, 30.0]
    assert _turn_start(both) == 4


def test_wind_at_touchdown_is_split_against_the_runway():
    """Runway 27 (270 true), wind 12 kt from 300: 10 kt headwind, 6 kt
    crosswind from the right; gusting 8-14 over the final."""
    samples, _ = build_landing_samples()
    for s in samples:
        s.wind_dir_deg = 300.0
        s.wind_kt = 12.0
    # A gust pattern in the last 30 s of the approach
    airborne = [s for s in samples if not s.on_ground and s.agl_ft < 300]
    for k, s in enumerate(airborne):
        s.wind_kt = 8.0 + 6.0 * ((k // 5) % 2)
    detector = FlightDetector()
    flight = [f for s in samples if (f := detector.feed(s)) is not None][0]
    times, _ = flight_times(flight.samples, zero_ts=flight.departure_ts)
    landing = build_landing(flight, times, [RUNWAY])
    td = landing["touchdowns"][0]
    assert td["windDirDeg"] == 300 and td["windKt"] in (8, 14)
    assert td["headwindKt"] == round(td["windKt"] * math.cos(math.radians(30)))
    assert td["crosswindKt"] == round(td["windKt"] * math.sin(math.radians(30)))  # positive = from the right
    assert (landing["windMinKt"], landing["windMaxKt"]) == (8, 14)
