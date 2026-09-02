"""flight-recorder: record MSFS flights and push them to the activity stream.

Live mode (Windows, default): idles until MSFS is running, detects flights,
and pushes each one at flight end. Raw samples for every flight are dumped to
the data dir so they can be replayed during development.

Replay mode (--replay samples.csv): runs the identical pipeline over a dump.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from dotenv import load_dotenv

from flight_recorder.detector import Flight, FlightDetector
from flight_recorder.enrich import AirportIndex, enrich
from flight_recorder.payload import build_item
from flight_recorder.push import Pusher
from flight_recorder.telemetry import write_samples

log = logging.getLogger("flight_recorder")

DEFAULT_INGEST_URL = "https://davesnider.com/api/activity/ingest/flight"


def data_dir() -> Path:
    return Path(os.environ.get("FLIGHT_RECORDER_HOME", Path.home() / ".flight-recorder"))


def handle_flight(flight: Flight, aircraft_title: str | None, args, pusher: Pusher | None) -> None:
    home = data_dir()
    dump_path = home / "flights" / f"{int(flight.departure_ts)}.csv"
    write_samples(dump_path, flight.samples)
    log.info("flight recorded (%d samples), raw dump at %s", len(flight.samples), dump_path)

    first, last = flight.samples[0], flight.samples[-1]
    enrichment = enrich(
        first.lat,
        first.lon,
        last.lat,
        last.lon,
        os.environ.get("SIMBRIEF_USERNAME"),
        AirportIndex(home),
    )
    item = build_item(flight, enrichment, aircraft_title)

    if args.dry_run or pusher is None:
        print(json.dumps(item, indent=2))
        return
    pusher.push(item)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--replay", type=Path, help="process a raw-sample CSV instead of connecting to the sim")
    parser.add_argument("--dry-run", action="store_true", help="print the payload instead of pushing it")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    # Log to stderr AND ~/.flight-recorder/recorder.log — the recorder runs
    # as a hidden scheduled task, so the file is the only window into it.
    log_path = data_dir() / "recorder.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(log_path, maxBytes=1_000_000, backupCount=2, encoding="utf-8")
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(), file_handler],
    )
    # Python-SimConnect logs its per-poll variable registrations at ERROR
    # level ("SIM def(...)"); they're routine noise, not failures.
    logging.getLogger("SimConnect").setLevel(logging.CRITICAL)
    log.info("flight-recorder started")
    # Config: .env next to the executable/cwd, then ~/.flight-recorder/.env
    load_dotenv()
    load_dotenv(data_dir() / ".env")

    token = os.environ.get("ACTIVITY_INGEST_TOKEN")
    pusher = None
    if not args.dry_run:
        if not token:
            sys.exit("ACTIVITY_INGEST_TOKEN is not set (put it in ~/.flight-recorder/.env), or use --dry-run")
        pusher = Pusher(
            os.environ.get("FLIGHT_INGEST_URL", DEFAULT_INGEST_URL),
            token,
            data_dir() / "queue",
        )
        pusher.flush_queue()

    if args.replay:
        from flight_recorder.sources import ReplaySource

        source = ReplaySource(args.replay)
    else:
        from flight_recorder.sources import SimConnectSource

        source = SimConnectSource()

    detector = FlightDetector()
    try:
        for sample in source.samples():
            flight = detector.feed(sample)
            if flight is not None:
                handle_flight(flight, source.aircraft_title, args, pusher)
                if pusher is not None:
                    pusher.flush_queue()
    except KeyboardInterrupt:
        pass

    # Replay files often end right after touchdown, before the landed-hold
    # expires; don't lose that flight.
    flight = detector.flush()
    if flight is not None:
        handle_flight(flight, source.aircraft_title, args, pusher)


if __name__ == "__main__":
    main()
