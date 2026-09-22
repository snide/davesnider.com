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
    # Landing analysis (added 2026-09-14). Attitude and body velocities are
    # stored RAW as the sim reports them (degrees / knots / fpm after unit
    # conversion, but with the sim's sign conventions): landing.py owns the
    # sign interpretation so a wrong guess is fixed in one place and every
    # dump replays correctly.
    bank_deg: float = 0.0  # PLANE_BANK_DEGREES; sim sign (believed negative = right wing down)
    pitch_deg: float = 0.0  # PLANE_PITCH_DEGREES; sim sign (believed positive = nose down)
    heading_true_deg: float = 0.0  # PLANE_HEADING_DEGREES_TRUE
    lateral_kt: float = 0.0  # VELOCITY_BODY_X, sideways body velocity (positive = right)
    world_vs_fpm: float = 0.0  # VELOCITY_WORLD_Y, true vertical velocity (not the VSI)
    # Latched by the sim at each touchdown; hold until the next one.
    td_bank_deg: float = 0.0  # PLANE_TOUCHDOWN_BANK_DEGREES
    td_pitch_deg: float = 0.0  # PLANE_TOUCHDOWN_PITCH_DEGREES
    td_heading_deg: float = 0.0  # PLANE_TOUCHDOWN_HEADING_DEGREES_TRUE
    td_lat: float = 0.0  # PLANE_TOUCHDOWN_LATITUDE
    td_lon: float = 0.0  # PLANE_TOUCHDOWN_LONGITUDE
    # Gear strut compression, percent. Point 0 is the nose (tail) wheel,
    # 1/2 the mains in MSFS's contact-point convention; ~0 while airborne.
    cp0_pct: float = 0.0
    cp1_pct: float = 0.0
    cp2_pct: float = 0.0
    # SURFACE TYPE enum under the aircraft (MSFS: 0 concrete, 1 grass, 2 water,
    # 3 grass bumpy, 4 asphalt, …); -1 on dumps that predate it.
    surface_type: float = -1.0
    # CRASH FLAG / CRASH SEQUENCE enums (0 = no crash); 0 on older dumps, so a
    # flight recorded before the channel never reads as a crash.
    crash_flag: float = 0.0
    crash_sequence: float = 0.0


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


_BOOL_FIELDS = {f.name for f in fields(Sample) if f.type == "bool"}


def read_samples(path: Path) -> list[Sample]:
    """Read a raw-sample CSV. Missing columns (older dumps) fall back to the
    dataclass defaults, so dumps stay replayable across format changes."""
    samples: list[Sample] = []
    with path.open(newline="") as fh:
        for row in csv.DictReader(fh):
            kwargs: dict = {}
            for name in CSV_FIELDS:
                value = row.get(name)
                if value in (None, ""):
                    continue
                kwargs[name] = bool(int(float(value))) if name in _BOOL_FIELDS else float(value)
            samples.append(Sample(**kwargs))
    return samples
