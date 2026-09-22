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
from flight_recorder.gate import SampleGate
from flight_recorder.enrich import AirportIndex, RunwayIndex, SimRunwayCache, enrich
from flight_recorder.landing import surface_of
from flight_recorder.payload import build_item, flight_times
from flight_recorder.photos import find_flight_photos, photo_meta, screenshot_dir
from flight_recorder.push import Pusher
from flight_recorder.telemetry import write_samples

log = logging.getLogger("flight_recorder")

DEFAULT_INGEST_URL = "https://davesnider.com/api/activity/ingest/flight"


def data_dir() -> Path:
    return Path(os.environ.get("FLIGHT_RECORDER_HOME", Path.home() / ".flight-recorder"))


def runway_ends_for(dest_icao: str, near: tuple[float, float], source, home: Path):
    """The destination's runways: the sim's own geometry (cached across
    sessions), else the OurAirports database."""
    cache = SimRunwayCache(home)
    ends = cache.get(dest_icao)
    if ends:
        return ends
    ends = source.runway_ends(dest_icao, near) if source is not None else None
    if ends:
        cache.put(dest_icao, ends)
        return ends
    return RunwayIndex(home).for_airport(dest_icao)


def latest_dumps(home: Path, count: int = 1) -> list[Path]:
    """The `count` most recent finished flight dumps, oldest first; the
    crash-safety `-inprogress` snapshots don't count."""
    dumps = sorted(
        (p for p in (home / "flights").glob("*.csv") if not p.stem.endswith("-inprogress")),
        key=lambda p: p.stem,
    )
    return dumps[-count:] if count > 0 else []


def handle_flight(flight: Flight, aircraft_title: str | None, args, pusher: Pusher | None, source=None) -> None:
    """Dump, enrich, and push one finished flight. Never raises — the raw
    dump is written first, so any enrich/push failure is recoverable via
    --replay and must not take the recorder down mid-session."""
    home = data_dir()
    dump_path = home / "flights" / f"{int(flight.departure_ts)}.csv"
    write_samples(dump_path, flight.samples)
    # The final dump supersedes the crash-safety copy
    (home / "flights" / f"{int(flight.departure_ts)}-inprogress.csv").unlink(missing_ok=True)
    # The samples don't carry the aircraft title; a sidecar does, so a replay
    # keeps the airframe (gauge limits, Vref) instead of blanking it.
    if aircraft_title and not getattr(args, "replaying", False):
        (dump_path.with_suffix(".json")).write_text(json.dumps({"aircraftTitle": aircraft_title}), encoding="utf-8")
    log.info("flight recorded (%d samples), raw dump at %s", len(flight.samples), dump_path)

    try:
        first, last = flight.samples[0], flight.samples[-1]
        start_water = surface_of([s for s in flight.samples if s.ts < flight.departure_ts]) == "water"
        end_water = surface_of([s for s in flight.samples if s.ts >= flight.arrival_ts]) == "water"
        if end_water:
            log.info("water landing (surface type %s)", last.surface_type)
        crashed = [s for s in flight.samples if s.crash_flag > 0 or s.crash_sequence > 0]
        if crashed:
            log.info(
                "crash flagged by the sim (flag %s, sequence %s)",
                max(s.crash_flag for s in crashed),
                max(s.crash_sequence for s in crashed),
            )
        enrichment = enrich(
            first.lat,
            first.lon,
            last.lat,
            last.lon,
            os.environ.get("SIMBRIEF_USERNAME"),
            AirportIndex(home),
            start_water=start_water,
            end_water=end_water,
        )
        runway_ends = [] if end_water else runway_ends_for(enrichment.dest_icao, (last.lat, last.lon), source, home)
        item = build_item(flight, enrichment, aircraft_title, runway_ends)
        if getattr(args, "replaying", False):
            # A replay exists to reprocess: the server updates the flight in
            # place (keeping its screenshot, trip tags and photos) instead of
            # skipping it as a duplicate. Live recordings never set this, so
            # a retried push still can't overwrite anything.
            item["replace"] = True

        if args.dry_run or pusher is None:
            print(json.dumps(item, indent=2))
            return
        pusher.push(item)

        # Attach photo-mode screenshots taken during the flight window.
        # Best effort: the flight is already pushed, and replays re-attach
        # harmlessly (the server dedupes by URL).
        photos = find_flight_photos(screenshot_dir(), flight.samples[0].ts, flight.samples[-1].ts)
        if photos:
            times, _ = flight_times(flight.samples, zero_ts=flight.departure_ts)
            log.info("found %d photo-mode screenshot(s) in the flight window", len(photos))
            for photo in photos:
                meta = photo_meta(photo.stat().st_mtime, flight.samples, times)
                pusher.push_photo(item["externalId"], photo, meta["t"], meta["lat"], meta["lon"])
    except Exception:
        log.exception("failed to enrich/push flight %d; recover with --replay %s", int(flight.departure_ts), dump_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--replay", type=Path, help="reprocess a raw-sample CSV instead of connecting to the sim (updates the flight on the site)")
    parser.add_argument(
        "--replay-last",
        nargs="?",
        type=int,
        const=1,
        metavar="N",
        help="reprocess the newest dump in ~/.flight-recorder/flights (or the N newest, oldest first)",
    )
    parser.add_argument("--dry-run", action="store_true", help="print the payload instead of pushing it")
    parser.add_argument("--aircraft", help="aircraft title for a replay whose dump predates the sidecar (e.g. \"A2A Piper PA-24-250 Comanche\")")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()
    replays: list[Path] = [args.replay] if args.replay else []
    if args.replay_last is not None:
        replays = latest_dumps(data_dir(), args.replay_last)
        if not replays:
            sys.exit(f"no dumps in {data_dir() / 'flights'}")
    args.replaying = bool(replays)

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

    if replays:
        from flight_recorder.sources import ReplaySource

        for path in replays:
            log.info("replaying %s", path)
            source = ReplaySource(path)
            if args.aircraft:
                source.aircraft_title = args.aircraft
            run_source(source, args, pusher)
    else:
        from flight_recorder.sources import SimConnectSource

        run_source(SimConnectSource(), args, pusher)


def run_source(source, args, pusher: Pusher | None) -> None:
    """Feed one source through gate + detector until it ends, handling every
    flight it produces."""
    detector = FlightDetector()
    gate = SampleGate()
    # Crash safety: while airborne, snapshot raw samples every minute so a
    # killed process or crashed sim loses at most a minute (recover with
    # --replay on the -inprogress.csv).
    last_snapshot = 0.0
    try:
        for sample in source.samples():
            if sample is None:
                # Telemetry stopped (sim closed / back to menu). A flight that
                # already touched down finalizes now instead of waiting out
                # the rollout hold that will never come.
                flight = detector.flush()
                if flight is not None:
                    log.info("telemetry stopped after touchdown; finalizing flight")
                    handle_flight(flight, source.aircraft_title, args, pusher, source)
                    if pusher is not None:
                        pusher.flush_queue()
                continue

            if not gate.accept(sample):
                continue

            flight = detector.feed(sample)
            if flight is not None:
                handle_flight(flight, source.aircraft_title, args, pusher, source)
                if pusher is not None:
                    pusher.flush_queue()
            elif detector.in_flight and sample.ts - last_snapshot >= 60:
                last_snapshot = sample.ts
                write_samples(
                    data_dir() / "flights" / f"{int(detector.departure_ts or 0)}-inprogress.csv",
                    detector.pending_samples,
                )
    except KeyboardInterrupt:
        pass

    # Replay files often end right after touchdown, before the landed-hold
    # expires; don't lose that flight.
    flight = detector.flush()
    if flight is not None:
        handle_flight(flight, source.aircraft_title, args, pusher, source)


if __name__ == "__main__":
    main()
