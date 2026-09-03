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
                ias_kt=100.0, tas_kt=105.0, heading_deg=0.0,
                wind_dir_deg=180.0, wind_kt=10.0, in_cloud=(300 < i < 400),
                fuel_gal=24.0 - i * 0.001, g_force=1.0 + (0.4 if i == 500 else 0.0),
            )
        )
        t += 1
    for i in range(180):
        f = detector.feed(Sample(t, 45.24, -122.0, 100.0, max(5.0, 40.0 - i), 0.0, True, fuel_gal=23.3))
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

    assert item["fuelBurnedGal"] == 0.7
    assert item["maxG"] == 1.4
    # wind 180 deg vs heading 0 -> pure tailwind of 10 -> component -10
    assert item["avgHeadwindKt"] == -10
    assert math.isclose(item["distanceNm"], round(item["distanceNm"]))
