"""Synthetic telemetry for tests: a short hop with climb, cruise, descent."""

from flight_recorder.telemetry import Sample

T0 = 1_756_000_000.0


def build_flight_samples() -> list[Sample]:
    samples = []
    t = T0
    lat, lon, alt = 45.0, -122.0, 100.0

    # 60s taxi/hold on the ground
    for _ in range(60):
        samples.append(Sample(t, lat, lon, alt, 10.0, 0.0, True))
        t += 1

    # takeoff roll + climb to 5000ft over 300s
    for i in range(300):
        lat += 0.0004
        alt = 100 + (i / 300) * 4900
        samples.append(Sample(t, lat, lon, alt, 120.0, 900.0, False))
        t += 1

    # cruise 600s
    for _ in range(600):
        lat += 0.0005
        samples.append(Sample(t, lat, lon, 5000.0, 140.0, 0.0, False))
        t += 1

    # descent 300s
    for i in range(300):
        lat += 0.0004
        alt = 5000 - (i / 300) * 4900
        vs = -700.0 if i < 299 else -180.0
        samples.append(Sample(t, lat, lon, alt, 110.0, vs, False))
        t += 1

    # rollout + taxi, 180s on the ground
    for i in range(180):
        gs = max(5.0, 60.0 - i)
        samples.append(Sample(t, lat, lon, 100.0, gs, 0.0, True))
        t += 1

    return samples
