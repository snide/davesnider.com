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
