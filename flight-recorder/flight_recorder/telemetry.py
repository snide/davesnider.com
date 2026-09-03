"""Telemetry sample model and CSV round-tripping.

The raw-sample CSV is both the debug artifact (--dump) and the dev-loop input
(--replay), so the whole pipeline past the SimConnect adapter runs on Linux.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, fields
from pathlib import Path


@dataclass
class Sample:
    ts: float  # unix seconds
    lat: float
    lon: float
    alt_ft: float  # indicated altitude above MSL
    gs_kt: float  # ground speed, knots
    vs_fpm: float  # vertical speed, feet per minute (negative = descending)
    on_ground: bool
    # Extended channels (defaulted so old dumps and terse test fixtures load).
    # None of these drive detection; they exist so raw dumps capture everything
    # a future card feature might want to plot.
    ias_kt: float = 0.0  # indicated airspeed, knots
    tas_kt: float = 0.0  # true airspeed, knots
    heading_deg: float = 0.0  # magnetic heading (verify units against a real dump)
    wind_dir_deg: float = 0.0  # ambient wind direction, degrees
    wind_kt: float = 0.0  # ambient wind speed, knots
    oat_c: float = 0.0  # ambient temperature, Celsius
    in_cloud: bool = False  # AMBIENT_IN_CLOUD
    fuel_gal: float = 0.0  # total fuel quantity, gallons (diff = burn)
    g_force: float = 0.0
    touchdown_fpm: float = 0.0  # PLANE_TOUCHDOWN_NORMAL_VELOCITY, ft/min (last touchdown)
    rpm: float = 0.0  # GENERAL_ENG_RPM:1
    fuel_flow_gph: float = 0.0  # ENG_FUEL_FLOW_GPH:1
    agl_ft: float = 0.0  # PLANE_ALT_ABOVE_GROUND; terrain elevation = alt_ft - agl_ft


CSV_FIELDS = [f.name for f in fields(Sample)]


def write_samples(path: Path, samples: list[Sample]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(CSV_FIELDS)
        for s in samples:
            writer.writerow(
                [int(v) if isinstance(v, bool) else v for v in (getattr(s, name) for name in CSV_FIELDS)]
            )


def _field(row: dict, name: str, default: float) -> float:
    value = row.get(name)
    return float(value) if value not in (None, "") else default


def read_samples(path: Path) -> list[Sample]:
    """Read a raw-sample CSV. Missing columns (older dumps) fall back to the
    dataclass defaults, so dumps stay replayable across format changes."""
    samples: list[Sample] = []
    with path.open(newline="") as fh:
        for row in csv.DictReader(fh):
            samples.append(
                Sample(
                    ts=float(row["ts"]),
                    lat=float(row["lat"]),
                    lon=float(row["lon"]),
                    alt_ft=float(row["alt_ft"]),
                    gs_kt=float(row["gs_kt"]),
                    vs_fpm=float(row["vs_fpm"]),
                    on_ground=bool(int(row["on_ground"])),
                    ias_kt=_field(row, "ias_kt", 0.0),
                    tas_kt=_field(row, "tas_kt", 0.0),
                    heading_deg=_field(row, "heading_deg", 0.0),
                    wind_dir_deg=_field(row, "wind_dir_deg", 0.0),
                    wind_kt=_field(row, "wind_kt", 0.0),
                    oat_c=_field(row, "oat_c", 0.0),
                    in_cloud=bool(int(_field(row, "in_cloud", 0))),
                    fuel_gal=_field(row, "fuel_gal", 0.0),
                    g_force=_field(row, "g_force", 0.0),
                    touchdown_fpm=_field(row, "touchdown_fpm", 0.0),
                    rpm=_field(row, "rpm", 0.0),
                    fuel_flow_gph=_field(row, "fuel_flow_gph", 0.0),
                    agl_ft=_field(row, "agl_ft", 0.0),
                )
            )
    return samples
