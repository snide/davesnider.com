"""Track simplification: Douglas-Peucker on lat/lon plus altitude extrema.

Output points are [lat, lon, alt_ft, t_offset_sec] (offset from departure),
matching the site's FlightTrackPoint shape.
"""

from __future__ import annotations

from flight_recorder.telemetry import Sample

# ~0.0005 deg is roughly 30 m cross-track — short GA hops and pattern work
# render at z10-12, so the tolerance must be small; MAX_POINTS caps long
# airliner legs anyway.
DP_EPSILON_DEG = 0.0005
MAX_POINTS = 500


def _perp_distance(pt: Sample, a: Sample, b: Sample) -> float:
    """Perpendicular distance in degree-space (fine for a display track)."""
    x0, y0 = pt.lon, pt.lat
    x1, y1 = a.lon, a.lat
    x2, y2 = b.lon, b.lat
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((x0 - x1) ** 2 + (y0 - y1) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)))
    px, py = x1 + t * dx, y1 + t * dy
    return ((x0 - px) ** 2 + (y0 - py) ** 2) ** 0.5


def _douglas_peucker(samples: list[Sample], epsilon: float) -> set[int]:
    """Indices to keep. Iterative to dodge recursion limits on long tracks."""
    keep = {0, len(samples) - 1}
    stack = [(0, len(samples) - 1)]
    while stack:
        start, end = stack.pop()
        if end - start < 2:
            continue
        best_dist, best_idx = 0.0, None
        for i in range(start + 1, end):
            d = _perp_distance(samples[i], samples[start], samples[end])
            if d > best_dist:
                best_dist, best_idx = d, i
        if best_idx is not None and best_dist > epsilon:
            keep.add(best_idx)
            stack.append((start, best_idx))
            stack.append((best_idx, end))
    return keep


def _altitude_extrema(samples: list[Sample]) -> set[int]:
    """Local altitude min/max indices, so the elevation profile keeps its shape."""
    keep: set[int] = set()
    for i in range(1, len(samples) - 1):
        prev_alt, alt, next_alt = samples[i - 1].alt_ft, samples[i].alt_ft, samples[i + 1].alt_ft
        if (alt >= prev_alt and alt > next_alt) or (alt <= prev_alt and alt < next_alt):
            keep.add(i)
    return keep


def simplify_track(samples: list[Sample], departure_ts: float) -> list[list[float]]:
    if len(samples) < 2:
        return [[s.lat, s.lon, round(s.alt_ft), round(s.ts - departure_ts)] for s in samples]

    keep = _douglas_peucker(samples, DP_EPSILON_DEG) | _altitude_extrema(samples)
    indices = sorted(keep)

    # If extrema pushed us over budget, thin evenly but never drop the endpoints.
    if len(indices) > MAX_POINTS:
        step = len(indices) / MAX_POINTS
        thinned = [indices[int(i * step)] for i in range(MAX_POINTS)]
        thinned[0], thinned[-1] = indices[0], indices[-1]
        indices = sorted(set(thinned))

    return [
        [round(samples[i].lat, 5), round(samples[i].lon, 5), round(samples[i].alt_ft), round(samples[i].ts - departure_ts)]
        for i in indices
    ]
