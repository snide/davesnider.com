from flight_recorder.detector import FlightDetector
from flight_recorder.enrich import Enrichment
from flight_recorder.payload import build_item
from tests.synthetic import build_flight_samples


def test_build_item_shape():
    detector = FlightDetector()
    flight = next(f for s in build_flight_samples() if (f := detector.feed(s)) is not None)
    enrichment = Enrichment("KPDX", "Portland Intl", "KSEA", "Seattle-Tacoma Intl", "C172", "V23 SEA")

    item = build_item(flight, enrichment, "Cessna 172 Skyhawk")

    assert item["externalId"] == str(int(flight.departure_ts))
    assert item["pauses"] == []
    assert item["timestamp"] == item["arrivalTs"]
    assert item["durationSec"] == 1200
    assert item["originIcao"] == "KPDX"
    assert item["maxAltitudeFt"] == 5000
    assert item["landingRateFpm"] == -180
    assert item["distanceNm"] > 0
    assert all(len(p) == 4 for p in item["track"])


def test_channels_and_stats():
    import math

    from flight_recorder.detector import FlightDetector
    from flight_recorder.payload import CHANNEL_MAX_POINTS, build_item
    from flight_recorder.telemetry import Sample
    from tests.synthetic import T0

    detector = FlightDetector()
    t = T0
    flight = None
    for _ in range(10):
        detector.feed(Sample(t, 45.0, -122.0, 100.0, 40.0, 0.0, True, fuel_gal=24.0))
        t += 1
    for i in range(600):
        detector.feed(
            Sample(
                t, 45.0 + i * 0.0004, -122.0, 2000.0, 110.0, 0.0, False,
                ias_kt=100.0, tas_kt=105.0, heading_deg=90.0,
                wind_dir_deg=180.0, wind_kt=10.0, in_cloud=(300 < i < 400),
                fuel_gal=24.0 - i * 0.001, g_force=1.0 + (0.4 if i == 500 else 0.0),
            )
        )
        t += 1
    for i in range(180):
        f = detector.feed(Sample(t, 45.24, -122.0, 100.0, max(5.0, 40.0 - i), 0.0, True, fuel_gal=23.4))
        t += 1
        if f is not None:
            flight = f
    assert flight is not None

    enrichment = Enrichment("AAAA", None, "BBBB", None, None, None)
    item = build_item(flight, enrichment, "Test Plane")

    ch = item["channels"]
    assert len(ch["t"]) <= CHANNEL_MAX_POINTS + 1
    assert len(ch["t"]) == len(ch["ias"]) == len(ch["gs"]) == len(ch["inCloud"])
    assert len(ch["rpm"]) == len(ch["fuelFlow"]) == len(ch["t"])
    assert max(ch["ias"]) == 100
    assert 1 in ch["inCloud"] and 0 in ch["inCloud"]

    assert item["fuelBurnedGal"] == 0.6
    assert item["maxG"] == 1.4
    # Wind from 180 (true) vs the northbound ground course -> pure tailwind
    # of 10 -> component -10. The (magnetic) heading of 90 is ignored.
    assert item["avgHeadwindKt"] == -10
    assert math.isclose(item["distanceNm"], round(item["distanceNm"]))

    # 0.6 gal over the 600 s airborne (0.001 gal/s) -> 3.6 gph
    assert item["avgFuelFlowGph"] == 3.6
    assert abs(item["nmPerGal"] - item["distanceNm"] / 0.6) < 1.0
    # Fuel flow channel is the quantity slope, not the (dead) simvar
    ff = ch["fuelFlow"]
    assert len(ff) == len(ch["t"])
    assert 3.4 <= max(ff) <= 3.8
    # Still air: TAS 105 vs GS 110 -> tailwind saved ~5% of 600 s
    assert item["windCostSec"] == round(600 - 600 * 110 / 105)


def test_fuel_phases():
    from flight_recorder.detector import FlightDetector
    from flight_recorder.payload import build_item
    from flight_recorder.telemetry import Sample
    from tests.synthetic import T0

    detector = FlightDetector()
    t = T0
    flight = None
    fuel = 30.0

    def feed(alt, gs, vs, on_ground, burn):
        nonlocal t, fuel, flight
        fuel -= burn
        f = detector.feed(Sample(t, 45.0 + (t - T0) * 0.0003, -122.0, alt, gs, vs, on_ground, tas_kt=gs, fuel_gal=fuel))
        t += 1
        if f is not None:
            flight = f

    for _ in range(30):
        feed(100.0, 10.0, 0.0, True, 0.002)  # taxi: 0.06 gal
    for i in range(300):
        feed(100.0 + i * 10, 80.0, 600.0, False, 0.004)  # climb: 1.2 gal
    for _ in range(600):
        feed(3100.0, 120.0, 0.0, False, 0.002)  # cruise: 1.2 gal
    for i in range(300):
        feed(3100.0 - i * 10, 100.0, -600.0, False, 0.001)  # descent: 0.3 gal
    for i in range(180):
        feed(100.0, max(5.0, 40.0 - i), 0.0, True, 0.001)  # taxi-in: 0.18 gal
    assert flight is not None

    enrichment = Enrichment("AAAA", None, "BBBB", None, None, None)
    item = build_item(flight, enrichment, None)
    phases = item["fuelPhases"]
    assert set(phases) == {"taxi", "climb", "cruise", "descent"}
    # The 30 s smoothing window blurs each boundary by ~15 s; totals still add up
    assert abs(phases["climb"]["sec"] - 300) <= 20
    assert abs(phases["cruise"]["sec"] - 600) <= 30
    assert abs(phases["descent"]["sec"] - 300) <= 20
    assert abs(phases["climb"]["gal"] - 1.2) <= 0.1
    assert abs(phases["cruise"]["gal"] - 1.2) <= 0.1
    assert abs(phases["descent"]["gal"] - 0.3) <= 0.1
    assert phases["taxi"]["gal"] > 0
    assert phases["cruise"]["nm"] > phases["climb"]["nm"]
    total_gal = sum(p["gal"] for p in phases.values())
    assert abs(total_gal - item["fuelBurnedGal"]) <= 0.15
    # No wind (TAS == GS) -> no wind cost
    assert item["windCostSec"] == 0


def test_channels_are_time_uniform_with_fast_polling():
    """A 10 Hz burst in the flare must not crowd the channel grid."""
    from flight_recorder.detector import FlightDetector
    from flight_recorder.payload import CHANNEL_MAX_POINTS, build_item
    from flight_recorder.telemetry import Sample
    from tests.synthetic import T0

    detector = FlightDetector()
    t = T0
    flight = None
    for _ in range(10):
        detector.feed(Sample(t, 45.0, -122.0, 100.0, 40.0, 0.0, True))
        t += 1
    for i in range(600):
        detector.feed(Sample(t, 45.0 + i * 0.0004, -122.0, 2000.0, 110.0, 0.0, False, ias_kt=100.0))
        t += 1
    # 30 s flare polled at 10 Hz: 300 samples in the time of 30
    for i in range(300):
        detector.feed(Sample(t, 45.24 + i * 0.00001, -122.0, 2000.0 - i * 6, 70.0, -600.0, False, ias_kt=70.0, agl_ft=200 - i * 0.6))
        t += 0.1
    for i in range(180):
        f = detector.feed(Sample(t, 45.243, -122.0, 100.0, max(5.0, 40.0 - i), 0.0, True))
        t += 1
        if f is not None:
            flight = f
    assert flight is not None

    item = build_item(flight, Enrichment("AAAA", None, "BBBB", None, None, None), None)
    ch = item["channels"]
    assert len(ch["t"]) <= CHANNEL_MAX_POINTS + 1
    # Flare samples (ias 70) should be a small share of the grid, not a third
    flare_share = sum(1 for v in ch["ias"] if v == 70) / len(ch["ias"])
    assert flare_share < 0.1
    gaps = [b - a for a, b in zip(ch["t"], ch["t"][1:])]
    assert max(gaps) - min(gaps) <= 2


def test_pause_compression():
    from flight_recorder.detector import FlightDetector
    from flight_recorder.payload import build_item, flight_times
    from flight_recorder.telemetry import Sample
    from tests.synthetic import T0

    detector = FlightDetector()
    t = T0
    flight = None
    for _ in range(10):
        detector.feed(Sample(t, 45.0, -122.0, 100.0, 40.0, 0.0, True))
        t += 1
    for i in range(300):
        detector.feed(Sample(t, 45.0 + i * 0.0004, -122.0, 2000.0, 110.0, 0.0, False))
        t += 1
        if i == 150:
            t += 600  # six-minute sim pause mid-cruise
    for i in range(180):
        f = detector.feed(Sample(t, 45.12, -122.0, 100.0, max(5.0, 40.0 - i), 0.0, True))
        t += 1
        if f is not None:
            flight = f
    assert flight is not None

    times, pauses = flight_times(flight.samples, zero_ts=flight.departure_ts)
    assert len(pauses) == 1
    assert pauses[0]["sec"] == 600

    enrichment = Enrichment("AAAA", None, "BBBB", None, None, None)
    item = build_item(flight, enrichment, None)
    # Flying time excludes the 600s of excised pause
    wall = int(flight.arrival_ts - flight.departure_ts)
    assert item["durationSec"] == wall - 600
    assert item["pauses"] == pauses
    # Track offsets are on the compressed clock: no 600s jumps
    gaps = [b[3] - a[3] for a, b in zip(item["track"], item["track"][1:])]
    assert max(gaps) <= 31


def test_photo_matching_and_meta(tmp_path):
    import os

    from flight_recorder.detector import FlightDetector
    from flight_recorder.payload import flight_times
    from flight_recorder.photos import find_flight_photos, photo_meta
    from flight_recorder.telemetry import Sample
    from tests.synthetic import T0

    detector = FlightDetector()
    t = T0
    flight = None
    for _ in range(10):
        detector.feed(Sample(t, 45.0, -122.0, 100.0, 40.0, 0.0, True))
        t += 1
    pause_at = None
    for i in range(120):
        detector.feed(Sample(t, 45.0 + i * 0.001, -122.0, 2000.0, 110.0, 0.0, False))
        t += 1
        if i == 60:
            pause_at = t  # wall clock inside the upcoming gap
            t += 300
    for i in range(180):
        f = detector.feed(Sample(t, 45.12, -122.0, 100.0, max(5.0, 40.0 - i), 0.0, True))
        t += 1
        if f is not None:
            flight = f
    assert flight is not None

    # files: one in-window, one mid-pause, one hours earlier, one wrong ext
    def mk(name, mtime):
        p = tmp_path / name
        p.write_bytes(b"x")
        os.utime(p, (mtime, mtime))
        return p

    mk("early.png", flight.departure_ts - 3600)
    mk("notes.txt", flight.departure_ts + 30)
    in_flight = mk("shot1.png", flight.departure_ts + 30)
    in_pause = mk("shot2.jpg", pause_at + 120)

    photos = find_flight_photos(tmp_path, flight.departure_ts, flight.arrival_ts)
    assert photos == [in_flight, in_pause]

    times, pauses = flight_times(flight.samples, zero_ts=flight.departure_ts)
    meta = photo_meta(in_pause.stat().st_mtime, flight.samples, times)
    # Mid-pause photo maps to the pause point (t equals the recorded pause t +-1)
    assert abs(meta["t"] - pauses[0]["t"]) <= 1
    assert meta["lat"] == round(45.0 + 60 * 0.001, 5)
