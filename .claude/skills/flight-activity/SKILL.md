---
name: flight-activity
description: The MSFS flight pipeline end to end — the SimConnect recorder (gate, block-time detection, pause compression, telemetry channels, photo matching), flight/photo/screenshot endpoints, the ActivityItemFlight card (LayerChart group sync, MapLibre PMTiles map, gauges, photo pins, replay), PMTiles hosting, and the Linux replay dev loop. Load when touching flight-recorder/, the flight ingest/photo/screenshot routes, ActivityItemFlight.svelte, or the tiles/vite config that serves them.
---

# MSFS flight pipeline

> **Freshness**: last verified 2026-09-09 against layerchart 2.3.1, maplibre-gl 6.6, @protomaps/basemaps 5.7, Svelte 5.56, Python-SimConnect 0.4 (trip tagging + FlightTrip added).
> Anchor files are listed at the bottom — if one is missing or looks different, the code wins; update this skill (see "Keeping this skill current").
> Feed-wide patterns (schema discipline, add-a-type checklist) live in the `activity-system` skill. Windows install/build steps live in `flight-recorder/README.md` — don't duplicate them here.

## Pipeline shape

- PC SimConnect recorder (`flight-recorder/`, a uv subproject like `tui/`) →
  POST to `/api/activity/ingest/flight` (+`/photo`) with the
  `ACTIVITY_INGEST_TOKEN` bearer → flight card. **No Cloudflare worker** — the
  PC is the producer.
- Windows exe is built **on the PC** with PyInstaller (no cross-compiling from
  Linux). **`--collect-all SimConnect` is mandatory** — onefile builds
  otherwise miss `SimConnect.dll` and the exe dies in a window-flash.
  **Exe copies are frozen**: after every `git pull`, rebuild AND re-copy the
  Desktop copy, or fixes silently don't apply. GitHub Actions
  `flight-recorder-build.yml` (manual dispatch) is the no-toolchain backup.
- Recorder config lives in `~/.flight-recorder/.env`
  (`ACTIVITY_INGEST_TOKEN`, `SIMBRIEF_USERNAME`, optional `FLIGHT_INGEST_URL`
  dev-tunnel override, `SCREENSHOT_DIR`); state (dumps, queue, log) under
  `~/.flight-recorder/`. `recorder.log` is the window into the hidden process.

## Recorder modules (each rule bought by an incident)

- `sources.py` — 1 Hz poll. Per-simvar guard: an unknown variable logs once
  and self-disables (never stalls the stream). Staleness watchdog: connected
  with no valid samples for 120s → recycle the connection (**a SimConnect
  session opened at the MSFS main menu binds dead variable requests that
  never recover**). **Units are treacherous**: the wrapper returns VS and
  `PLANE_TOUCHDOWN_NORMAL_VELOCITY` in **ft/min** (a ×60 assumption produced
  a −9313 fpm landing) and `PLANE_HEADING_DEGREES_MAGNETIC` in **radians**
  (verified: 2.22 rad = the actual runway heading). Menus report lat/lon 0,0.
- `gate.py` — drops frozen duplicates (paused sim), rejects teleports
  (>400 ft or >0.01° per second — MSFS load-in garbage once produced a
  779 ft phantom spike + 192 s frozen block), requires 3 clean samples after
  any discontinuity.
- `detector.py` — **recording spans block time, t=0 is wheels-up**: a rolling
  20-min ground buffer is prepended at departure (trimmed to first movement
  −10 s, so runup is kept but gate-parked time isn't); taxi-in records
  through last movement. Landing rate prefers the sim's touchdown sensor
  over sampled VS. Touch-and-gos extend the flight (120 s landed hold);
  telemetry loss after touchdown finalizes immediately instead of starving.
- `payload.py` — the **compressed clock**: >10 s sample gaps are excised to
  1 s and recorded as `pauses: [{t, sec}]`; taxi rides negative offsets;
  `durationSec` is **flight time** (wheels-up→down on the compressed clock),
  not block or wall time. Track = Douglas-Peucker keeping altitude extrema
  and ≤30 s gaps (hover needs stops on flat cruise), ≤500 pts. `channels` =
  uniform ≤180 samples of ias/gs/wind/inCloud/rpm/fuelFlow/fuel/ground
  (`ground` = alt − AGL = terrain elevation). Stats: fuel diff, max G
  (1 Hz under-reads spikes), signed avg headwind from wind-vs-heading.
- `photos.py` — photo-mode shots matched by **file mtime over the block-time
  wall-clock window**; mid-pause photos map to the pause point. Default dir
  `%APPDATA%\Microsoft Flight Simulator 2024\Screenshot`.
- `push.py` — offline queue with retry (server dedupes by externalId, so
  retries are safe); `push_photo` multipart to `<ingest>/photo`.
- Crash safety: `-inprogress.csv` snapshot every airborne minute; every
  flight's raw dump lands in `~/.flight-recorder/flights/<departure_ts>.csv`
  — **externalId == dump filename**, which is the reprocess key.

## Server endpoints (two auth models)

- `src/routes/api/activity/ingest/flight/+server.ts` — bearer token (PC is
  the caller). Validates track (≤5000 pts, 4-tuples), channels (parallel
  arrays ≤500; rpm/fuelFlow/fuel/ground optional), pauses (≤50). Flights are
  immutable: duplicates skip.
- `.../ingest/flight/photo/+server.ts` — bearer token; multipart
  externalId/t/lat/lon/file; R2 content-addressing makes it idempotent
  (dedupe by URL, cap 12, sorted by t).
- `.../flight/[id]/screenshot/+server.ts` — **admin cookie** (`checkAuth`),
  because the browser is the caller; sets the 32:9 hero.
- `.../flight/[id]/trip/+server.ts` — admin cookie PATCH `{ trip?, tripStop? }`
  tagging a flight as a leg of a challenge trip. `trip` is a slug
  (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤64), `tripStop` free text (≤120; several
  goals on one leg are `" / "`-delimited — FlightTrip splits on the slash,
  commas may appear inside a name); absent =
  leave alone, null/blank = clear; clearing the trip clears the stop. Never
  `export` helpers from a `+server.ts` — SvelteKit 500s on unknown exports.
- `src/routes/api/activity/trip/[slug]/+server.ts` — public GET: every
  non-private flight with that `trip`, oldest first, **full detail rows**
  (track/channels/photos) so the trip map and the per-leg card need no second
  request. Unknown slug = `{ legs: [] }` with 200 (data entry happens on the
  feed after the post exists). 60 s cache.

## Card — ActivityItemFlight.svelte

- **LayerChart**: `ChartGroup` shares the pointer (`pointer.tooltip: false`
  so only the hovered chart shows content); replay drives
  `groupState.setPointer({x: Date})` via rAF. Brush on the chart →
  `brushRange` → `zoomDomain` (xDomain) + map `fitRange`, with a
  `resettingBrush` guard because `brush.reset()` echoes a brush-end.
  Tooltip mode `bisect-x` = all series every hover. Header shows `T±elapsed`
  (wall clock lies once pauses are excised).
- **`yNice={false}` is load-bearing**: photo-pin overlay math assumes the
  exact `[0, yCeil]` domain (yCeil = 1.4× max alt — room for the Pause
  label); LayerChart otherwise nice-rounds even explicit domains and the
  hover rings float off the ticks. Chart pin projection mirrors the chart's
  padding (0 horizontal / 12px vertical).
- **Annotations array** = IMC dot-pattern ranges (altitude-bounded from the
  `ground`+`inCloud` channels; fill `url(#imcDotPattern)` from the card's
  hidden svg defs) + dashed pause lines (**only `sec >= 60`** — shorter ones
  would label "Pause 0m") + photo ticks (`AnnotationPoint`).
- **MapLibre** lives in an `{@attach flightMap(theme)}` — the theme param
  makes the attachment re-run and rebuild the map on theme flip. The
  plumbing is shared via `src/lib/map/basemap.ts`: `loadMapLibs()`
  (memoized dynamic imports + `setWorkerUrl` + pmtiles `addProtocol`, once
  per page), `basemapStyle(basemaps, theme, { placeLabels, roadLabels })` (the
  trip map passes both `false` to drop city/neighbourhood names and road
  names/shields) and
  `mapPalette(theme)` (line/halo colours). **The `?worker&url` worker import lives there and is
  required** (Vite's dep-optimizer serves the library's own worker with a
  broken MIME). Mono flavors: grayscale (light) / black (dark).
  Attribution is a static line under the map (`attributionControl: false`) —
  the © OpenStreetMap credit is an ODbL requirement, keep it.
- **Trip chips/editor** under the title, **admin-only** (visitors never see
  trip data on the card; the trip post is the public face): `trip` /
  `tripStop` chips plus `+ tag trip` / `edit` / `clear`, which PATCH the
  trip route and mutate `details` (same reactive-proxy pattern as the
  screenshot upload).
- **Photo pins**: HTML buttons projected via `m.project` (re-projected on
  `move`) over the map, manual scale math over the chart; both drive one
  popover with an `activePinArea` discriminator and a 250 ms hover-grace
  timer. Click opens the raw R2 URL.
- **Gauges**: three ArcCharts (RPM / IAS / GAL), `GAUGE_RING = -4`, limits
  matched from the aircraft title — 172: 2700 rpm / 163 kt / 56 gal;
  Comanche (pa-24): 2575 / 197 / 60; default 2700 / 180 / 60. Readouts show
  the scrubbed value, else the cruise median (fuel: value at landing).
- **Vite (`vite.config.ts`) requirements — dev crashes without them**:
  `ssr.noExternal: ['layerchart']` (raw .svelte in the package →
  ERR_UNKNOWN_FILE_EXTENSION) and `optimizeDeps.include` for
  maplibre-gl/pmtiles/@protomaps/basemaps (dynamic-import-only deps miss the
  optimizer scan). A dev server started before a `pnpm add` needs a restart
  - `node_modules/.vite` clear.

## Trip component — FlightTrip.svelte

- `src/lib/components/FlightTrip/` renders a challenge trip in a post:
  `<FlightTrip trip="mlb-ballparks" title="…" targets?={[{name,lat,lon}]} />`.
  Fetches `/api/activity/trip/<slug>` on mount (the Gallery/FilesEmbed
  pattern — posts share one universal loader, no per-post server load).
- One interactive map with every leg's recorded track (`trip-legs` source;
  `trip-legs-line` / `-selected` via `setFilter` on `legIndex` / a 14 px
  invisible `-hit` twin for clicks), deduped airport circles + ICAO labels,
  stop circles + labels at the arrival of legs with a `tripStop`. Optional
  `targets` (name + optional `aliases`, lat/lon, `icon`/`iconDark`): a
  target is reached when a stop matches its name or an alias (case-
  insensitive, periods and extra whitespace ignored); reached targets'
  icons show in the leg list and the stops tile becomes `x / N`. Targets
  with coordinates go on the map (`targetsOnMap`, default on): the logo as
  a `maplibregl.Marker` HTML `<img>` (faded/grayscale until reached, click
  jumps to the leg), or a ring for icon-less targets. Goals already shown
  as a logo drop their airport stop label. **Overlay layers hang on
  `style.load`, not `load`** — `load` waits on every source and never
  fires when the pmtiles fetch errors (CORS from localhost).
  MLB set: `src/lib/data/mlb-teams.ts`
  with MLB's cap marks in `static/mlb/<slug>-{light,dark}.svg` (from
  `mlbstatic.com/team-logos/team-cap-on-{light,dark}/<id>.svg`). **`cooperativeGestures: true`** so the map never traps
  page scroll. `selectedIndex` is deliberately not read inside the
  attachment — selecting must not rebuild the map; a `$effect` re-applies
  the selection through `mapApi` after a theme rebuild.
- Below the map: a vertical leg list beside `ActivityItemFlight` rendered
  with `embedded` (no feed chrome, title or trip chips — the card starts at
  the screenshot; first leg selected on load). The list is absolutely
  positioned inside a stretched grid cell so the **card sets the row height
  and the list scrolls within it**; ≤768 px it stacks as a 14 rem scroll box
  above the card. The card is wrapped in `{#key activityId}` so its chart
  group, replay rAF, pins and map reset per leg.
- Post CSS (`src/routes/[slug]/+page.svelte`): `.flightTrip` is in the
  breakout allowlist, and `.post :global(.flightTrip *) { margin-bottom: 0 }`
  neutralises the article's global child margin inside the embed.

## Tiles

- Protomaps planet extract, z0–12 (~17.6 GB), at `tiles/planet.pmtiles` on
  the `davesnider` R2 bucket, read straight via range requests — **no tile
  server**. CORS on the bucket must allow the site origins and
  `ExposeHeaders: ["etag"]` (pmtiles staleness detection). Replacing the
  archive = upload over the same key + purge the Cloudflare cache path.
  Basemap fonts/sprites come from protomaps.github.io/basemaps-assets.

## Dev loop (everything past SimConnect runs on Linux)

```bash
cd flight-recorder && uv run pytest            # unit tests (uv is at ~/.local/bin)
uv run flight-recorder --replay dump.csv --dry-run   # full pipeline on a real dump
```

- Synthetic flights: the session scratchpad `fake_flight.py` generator (taxi/
  climb/cruise-with-pause/pattern/landing + channels) → ingest on a throwaway
  `pnpm vite dev --port 5199` → Playwright screenshots/DOM probes.
- Reprocessing a real flight after recorder fixes: pull+rebuild on the PC
  first, then `DELETE FROM activity WHERE type='flight' AND external_id='<ts>'`
  on prod, then `--replay ~/.flight-recorder/flights/<ts>.csv` (ingest skips
  duplicates, so delete must come first).
- Old dumps stay replayable: the CSV reader defaults missing columns.

## Anchor files (freshness check)

- `flight-recorder/flight_recorder/{sources,gate,detector,payload,photos,push,cli}.py`
- `flight-recorder/README.md` — Windows install/build/exe steps
- `src/routes/api/activity/ingest/flight/+server.ts` (+ `photo/`)
- `src/routes/api/activity/flight/[id]/screenshot/+server.ts` (+ `trip/`)
- `src/routes/api/activity/trip/[slug]/+server.ts`
- `src/lib/map/basemap.ts` — shared worker URL / protocol / style / palette
- `src/lib/components/ActivityItem/ActivityItemFlight.svelte`
- `src/lib/components/FlightTrip/FlightTrip.svelte`
- `vite.config.ts` — noExternal / optimizeDeps blocks
- `.github/workflows/flight-recorder-build.yml`

## Keeping this skill current

If this document contradicts the code, trust the code, then update this file
in the same PR. Changes to the recorder's time model (block time, pauses,
t=0), the payload/channel shapes, the endpoint contracts, the card's
sync/projection math, or the tiles/vite requirements must be reflected here
(and Windows-facing steps in `flight-recorder/README.md`).
