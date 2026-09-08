"""Photo-mode screenshot matching.

MSFS 2024 photo mode drops captures into a fixed folder; anything whose file
mtime falls inside the flight's wall-clock window (pauses included — photo
mode pauses the sim, so shots land inside excised gaps) belongs to the flight.
"""

from __future__ import annotations

import os
from pathlib import Path

from flight_recorder.telemetry import Sample

PHOTO_EXTENSIONS = {".png", ".jpg", ".jpeg"}
MAX_PHOTOS_PER_FLIGHT = 12
WINDOW_BEFORE_SEC = 5.0
WINDOW_AFTER_SEC = 30.0


def screenshot_dir() -> Path:
    configured = os.environ.get("SCREENSHOT_DIR")
    if configured:
        return Path(os.path.expandvars(configured)).expanduser()
    appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return Path(appdata) / "Microsoft Flight Simulator 2024" / "Screenshot"


def find_flight_photos(directory: Path, departure_ts: float, arrival_ts: float) -> list[Path]:
    """Photos taken during the flight, oldest first, capped."""
    if not directory.is_dir():
        return []
    lo = departure_ts - WINDOW_BEFORE_SEC
    hi = arrival_ts + WINDOW_AFTER_SEC
    matches = [
        path
        for path in directory.iterdir()
        if path.suffix.lower() in PHOTO_EXTENSIONS and path.is_file() and lo <= path.stat().st_mtime <= hi
    ]
    matches.sort(key=lambda p: p.stat().st_mtime)
    return matches[:MAX_PHOTOS_PER_FLIGHT]


def photo_meta(mtime: float, samples: list[Sample], times: list[float]) -> dict:
    """Nearest sample by wall clock -> position + compressed flight time.
    A photo taken mid-pause maps to the sample where the pause began."""
    best = 0
    for i in range(1, len(samples)):
        if abs(samples[i].ts - mtime) < abs(samples[best].ts - mtime):
            best = i
    return {
        "t": round(times[best]),
        "lat": round(samples[best].lat, 5),
        "lon": round(samples[best].lon, 5),
    }
