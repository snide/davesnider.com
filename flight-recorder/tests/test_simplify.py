from flight_recorder.detector import FlightDetector
from flight_recorder.simplify import MAX_POINTS, simplify_track
from tests.synthetic import build_flight_samples


def get_flight():
    detector = FlightDetector()
    for s in build_flight_samples():
        f = detector.feed(s)
        if f is not None:
            return f
    raise AssertionError("no flight detected")


def test_simplify_reduces_and_keeps_shape():
    flight = get_flight()
    track = simplify_track(flight.samples, flight.departure_ts)

    assert 2 <= len(track) <= MAX_POINTS
    assert len(track) < len(flight.samples)

    # Endpoints preserved
    assert track[0][3] == 0
    assert track[-1][3] == round(flight.samples[-1].ts - flight.departure_ts)

    # Cruise altitude survives simplification
    assert max(p[2] for p in track) == 5000

    # Offsets are monotonic
    offsets = [p[3] for p in track]
    assert offsets == sorted(offsets)


def test_flat_cruise_keeps_regular_points():
    from flight_recorder.simplify import MAX_GAP_SEC

    flight = get_flight()
    track = simplify_track(flight.samples, flight.departure_ts)
    gaps = [b[3] - a[3] for a, b in zip(track, track[1:])]
    assert max(gaps) <= MAX_GAP_SEC + 1
