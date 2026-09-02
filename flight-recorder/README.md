# flight-recorder

Records MSFS 2024 flights via SimConnect on the sim PC and pushes each one to
the site's activity stream (`/api/activity/ingest/flight`) at flight end. The
activity item renders the flown track on a MapLibre basemap plus a timeline
elevation graph.

## How it works

- Idles until MSFS is running (retries SimConnect every 30s), then samples
  once a second: position, altitude, ground speed, vertical speed, IAS/TAS,
  magnetic heading, ambient wind (direction + speed), temperature, in-cloud
  state, total fuel, G-force, and the sim's official touchdown velocity.
  Only position/altitude/speed drive the site today — the rest is captured in
  the raw dumps so future card features (wind, fuel burn, IMC bands) can be
  built without losing history.
- Flight boundaries are detected automatically: ground → airborne is a
  departure; on the ground and slow for 2 minutes is an arrival. Touch-and-gos
  extend the same flight. Landing rate is captured at touchdown.
- At flight end the track is Douglas-Peucker-simplified (altitude extrema kept
  so the elevation profile survives), enriched, and POSTed with the ingest
  bearer token. Failed pushes are queued in `~/.flight-recorder/queue/` and
  retried.
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

Once stable, build a single-file exe instead: the **Build flight-recorder exe**
GitHub Actions workflow (manual trigger) produces a `flight-recorder.exe`
artifact; then the PC needs neither git nor uv.

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
