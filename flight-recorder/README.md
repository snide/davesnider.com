# flight-recorder

Records MSFS 2024 flights via SimConnect on the sim PC and pushes each one to
the site's activity stream (`/api/activity/ingest/flight`) at flight end. The
activity item renders the flown track on a MapLibre basemap plus a timeline
elevation graph.

## How it works

- Idles until MSFS is running (retries SimConnect every 30s), then samples
  once a second (ten times a second below 50 ft or while rolling on the
  runway, so bounces are caught): position, altitude, ground speed, vertical speed, IAS/TAS,
  magnetic heading, ambient wind (direction + speed), temperature, in-cloud
  state, total fuel, G-force, and the sim's official touchdown velocity.
  Position/altitude/speed drive flight detection; the rest feeds the card's
  charts, gauges and stats (wind, fuel burn by phase, IMC bands). Fuel flow
  is derived from the fuel-quantity slope — the sim's fuel-flow simvar is
  dead on A2A aircraft — so a real quantity channel is all a card needs.
- Flight boundaries are detected automatically: ground → airborne is a
  departure; on the ground and slow for 2 minutes is an arrival. Touch-and-gos
  extend the same flight. Every touchdown of a landing is recorded: the
  landing rate is the hardest one and short hops between them count as
  bounces.
- At flight end the track is Douglas-Peucker-simplified (altitude extrema kept
  so the elevation profile survives), enriched, and POSTed with the ingest
  bearer token. Failed pushes are queued in `~/.flight-recorder/queue/` and
  retried.
- Photo-mode screenshots taken during the flight (matched by file mtime
  against the flight's wall-clock window) auto-upload after the push and pin
  to the map/timeline at the moment they were taken. Watched folder defaults
  to `%APPDATA%\Microsoft Flight Simulator 2024\Screenshot`; override with
  `SCREENSHOT_DIR` in the env file.
- Enrichment: if a SimBrief OFP generated in the last 12h matches where you
  actually took off and landed, its airports/aircraft/route are used (one-shot
  web API — SimBrief does not need to be running). Otherwise: SimConnect
  aircraft title + nearest airport from a cached OurAirports database.
- Raw samples for every flight are dumped to `~/.flight-recorder/flights/` so
  any flight can be replayed during development.

## Windows setup (sim PC)

```powershell
winget install Git.Git
winget install astral-sh.uv
git clone <this repo>
cd ds/flight-recorder
uv run flight-recorder --dry-run   # first smoke test, prints instead of pushing
```

Config lives in `~/.flight-recorder/.env`:

```
ACTIVITY_INGEST_TOKEN=...
SIMBRIEF_USERNAME=...
# FLIGHT_INGEST_URL=https://local.davesnider.com/api/activity/ingest/flight  # dev tunnel
```

Run at login: Task Scheduler → new task → run `uv run --directory <path>\ds\flight-recorder flight-recorder`
(or the built exe) at log on, hidden.

Once stable, build a single-file exe right on the PC (PyInstaller can't
cross-compile, so the Windows box is where exes come from):

```powershell
uv run --with pyinstaller pyinstaller --onefile --name flight-recorder --collect-all SimConnect flight_recorder\__main__.py
```

Point Task Scheduler at `dist\flight-recorder.exe`; it reads the same
`~/.flight-recorder/.env`. Rebuild after a `git pull` to pick up fixes.
(`--collect-all SimConnect` bundles the package's SimConnect.dll, which
onefile builds otherwise miss.) Alternatively the **Build flight-recorder
exe** GitHub Actions workflow (manual trigger) produces the same exe as a
download, for the day git/uv come off the machine entirely.

## Linux dev loop

Everything past the SimConnect adapter runs anywhere:

```bash
uv run pytest                                  # unit tests on synthetic telemetry
uv run flight-recorder --replay dump.csv --dry-run   # full pipeline on a real dump
```

`dump.csv` is any file from `~/.flight-recorder/flights/` on the PC.

## Basemap hosting (one-time site setup)

The activity item reads a Protomaps PMTiles archive straight from R2 via HTTP
range requests — no tile server or worker.

1. Grab a daily planet build and cut it down to feed-map zooms. Short GA
   flights and pattern work render at z10-12, so keep those zooms; full
   planet coverage (~15-30 GB, well under $1/mo on R2) means any flight
   anywhere renders — no bbox to outgrow:
   ```bash
   pmtiles extract https://build.protomaps.com/$(date +%Y%m%d).pmtiles planet.pmtiles --maxzoom=12
   ```
   (Expect a large one-time download and upload; add e.g.
   `--bbox=-170,14,-50,72` for North America only if that's a problem.)
2. Upload with rclone to the R2 bucket behind `files.davesnider.com` at
   `tiles/planet.pmtiles` (matches `TILES_URL` in `ActivityItemFlight.svelte`).
3. Ensure the bucket's CORS policy allows `GET` + `Range` from
   `https://davesnider.com` (and the local dev origins).

Fonts/sprites load from Protomaps' public assets CDN.

## Runway geometry (optional, recommended)

The landing panel draws the runway you landed on. By default the runway
comes from the OurAirports database, which can sit tens of feet from where
MSFS drew it (36 ft at KO69). With a current SimConnect.dll the recorder
asks the sim for the runway instead. The Python-SimConnect wrapper bundles
an old DLL without that API, so:

1. Install the MSFS SDK (in the sim: Options → General → Developers → on,
   then Help → SDK installer), or unpack any MSFS SDK.
2. The recorder finds `SimConnect SDK\lib\SimConnect.dll` via the
   `MSFS2024_SDK` / `MSFS_SDK` environment variables or the default
   `C:\MSFS 2024 SDK` / `C:\MSFS SDK` folders. Anywhere else, set
   `SIMCONNECT_DLL=<full path>` in `~/.flight-recorder/.env`.
3. `recorder.log` says which DLL connected and, after a landing,
   `sim runways for O69: 29, 11`. Fetched runways are cached in
   `~/.flight-recorder/sim_runways.json`.

Without it you get one warning at connect and the database fallback.

## Reprocessing a flight

Every flight's raw samples are kept in `~/.flight-recorder/flights/<departure>.csv`.
After a recorder change, rerun the newest one and the site updates that
flight in place (screenshot, trip tags and photos are kept):

```
uv run flight-recorder --replay-last        # newest dump
uv run flight-recorder --replay-last 2      # the one before it
uv run flight-recorder --replay path.csv    # a specific dump
```

Add `--dry-run` to print the payload instead of pushing it. Only replays
update existing flights; a live recording that is retried after a network
failure still skips as a duplicate.
