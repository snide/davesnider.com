from flight_recorder.detector import FlightDetector
from tests.synthetic import T0, build_flight_samples


def test_detects_one_flight():
    detector = FlightDetector()
    flights = [f for s in build_flight_samples() if (f := detector.feed(s)) is not None]
    assert len(flights) == 1
    flight = flights[0]
    # Departure at first airborne sample (post ground phase)
    assert flight.departure_ts == T0 + 60
    # Arrival at touchdown, not at the end of the rollout hold
    assert flight.arrival_ts == T0 + 60 + 1200
    # Landing rate is the last airborne VS
    assert flight.landing_rate_fpm == -180


def test_ground_only_never_emits():
    from flight_recorder.telemetry import Sample

    detector = FlightDetector()
    for i in range(600):
        assert detector.feed(Sample(T0 + i, 45.0, -122.0, 100.0, 8.0, 0.0, True)) is None
    assert detector.flush() is None


def test_official_touchdown_velocity_preferred():
    from flight_recorder.telemetry import Sample

    detector = FlightDetector()
    t = T0
    flights = []
    for _ in range(10):
        detector.feed(Sample(t, 45.0, -122.0, 100.0, 40.0, 0.0, True))
        t += 1
    for _ in range(60):
        f = detector.feed(Sample(t, 45.0, -122.0, 1000.0, 100.0, -300.0, False))
        t += 1
    # Rollout samples carry the sim's touchdown reading in ft/min
    for _ in range(180):
        f = detector.feed(Sample(t, 45.0, -122.0, 100.0, 10.0, 0.0, True, touchdown_fpm=240.0))
        t += 1
        if f is not None:
            flights.append(f)
    assert len(flights) == 1
    assert flights[0].landing_rate_fpm == -240


def test_flush_finalizes_after_touchdown_without_hold():
    """Exiting to the sim menu right after landing must not lose the flight."""
    from flight_recorder.telemetry import Sample

    detector = FlightDetector()
    t = T0
    for _ in range(10):
        detector.feed(Sample(t, 45.0, -122.0, 100.0, 40.0, 0.0, True))
        t += 1
    for _ in range(60):
        detector.feed(Sample(t, 45.0, -122.0, 1000.0, 100.0, -300.0, False))
        t += 1
    # Only 5s of rollout — nowhere near the 120s hold — then telemetry stops
    for _ in range(5):
        assert detector.feed(Sample(t, 45.0, -122.0, 100.0, 30.0, 0.0, True, touchdown_fpm=200.0)) is None
        t += 1

    flight = detector.flush()
    assert flight is not None
    assert flight.landing_rate_fpm == -200
    assert flight.arrival_ts == T0 + 70
