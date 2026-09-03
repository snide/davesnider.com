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


def test_gate_drops_frozen_and_teleport_samples():
    from flight_recorder.gate import SampleGate
    from flight_recorder.telemetry import Sample

    gate = SampleGate()
    t = T0
    # seed + stability window
    results = []
    for i in range(6):
        results.append(gate.accept(Sample(t + i, 45.0 + i * 0.0001, -122.0, 100.0 + i, 10.0 + i * 0.1, 0.0, True)))
    assert results[-1] is True  # stable stream passes after warmup

    # frozen (paused sim) samples are dropped
    last = Sample(t + 10, 45.001, -122.0, 106.0, 11.0, 0.0, True)
    assert gate.accept(last) is True
    frozen = Sample(t + 11, 45.001, -122.0, 106.0, 11.0, 0.0, True)
    assert gate.accept(frozen) is False

    # teleport rejected, then stability required again
    assert gate.accept(Sample(t + 12, 45.001, -122.0, 900.0, 11.0, 0.0, False)) is False
    stable_again = []
    for i in range(4):
        stable_again.append(gate.accept(Sample(t + 13 + i, 45.0012 + i * 0.0001, -122.0, 901.0 + i, 11.0, 0.0, False)))
    assert stable_again[-1] is True
