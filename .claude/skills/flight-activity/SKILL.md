---
name: flight-activity
description: The MSFS flight pipeline end to end — the SimConnect recorder (gate, block-time detection, pause compression, telemetry channels, photo matching), flight/photo/screenshot endpoints, the ActivityItemFlight card (LayerChart group sync, MapLibre PMTiles map, gauges, photo pins, replay), PMTiles hosting, and the Linux replay dev loop. Load when touching flight-recorder/, the flight ingest/photo/screenshot routes, ActivityItemFlight.svelte, or the tiles/vite config that serves them.
---

# MSFS flight pipeline

> **Freshness**: last verified 2026-09-10 against layerchart 2.3.1, maplibre-gl 6.6, @protomaps/basemaps 5.7, Svelte 5.56, Python-SimConnect 0.4 (photo carousel + Cloudflare image resizing, fuel stats, wind layer, bounce-aware landings, 10 Hz near-ground polling).
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

- `sources.py` — 1 Hz poll, **10 Hz near the ground** (`poll_interval`:
  airborne under 50 ft AGL, or on the ground above 30 kt) so a sub-second
  bounce shows up as an airborne sample. Everything downstream is
  time-based (channels pick by time, not index). Per-simvar guard: an unknown variable logs once
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
  through last movement. **A landing is a list of `Touchdown`s**: every
  return to the ground is one; airborne again for ≤10 s and ≤50 ft AGL is a
  bounce (longer/higher = touch-and-go, landing discarded). The sensor
  (`PLANE_TOUCHDOWN_NORMAL_VELOCITY`) holds the previous landing's value
  while airborne (`_stale_sensor_fpm`, ignored on the ground) and a change
  in it while continuously on the ground = a touchdown between polls. Each
  touchdown prefers the sensor over sampled VS; `landing_rate_fpm` is the
  **hardest** of them (min, negative = down) and `bounces` = touchdowns − 1.
  Before this a bounce reset the landing and the gentle settle got scored.
  Touch-and-gos extend the flight (120 s landed hold);
  telemetry loss after touchdown finalizes immediately instead of starving.
- `payload.py` — the **compressed clock**: >10 s sample gaps are excised to
  1 s and recorded as `pauses: [{t, sec}]`; taxi rides negative offsets;
  `durationSec` is **flight time** (wheels-up→down on the compressed clock),
  not block or wall time. Track = Douglas-Peucker keeping altitude extrema
  and ≤30 s gaps (hover needs stops on flat cruise), ≤500 pts. `channels` =
  uniform ≤180 samples of ias/gs/wind/inCloud/rpm/fuelFlow/fuel/ground/oat
  (`ground` = alt − AGL = terrain elevation). **`fuelFlow` is derived from
  the fuel-quantity slope over a 5-min window**, not `ENG_FUEL_FLOW_GPH` —
  A2A's Accu-Sim never drives that simvar (it read 0.3–2.9 through a 15 gph
  climb; the raw value still lands in the CSV). Stats: fuel diff, max G
  (1 Hz under-reads spikes), signed avg headwind from wind vs the **true
  ground course** (`AMBIENT_WIND_DIRECTION` is true, the recorded heading is
  magnetic — comparing those skewed it by the variation; samples under
  30 kt GS are skipped as course noise),
  `avgFuelFlowGph` + `nmPerGal` (**airborne** burn over flight time /
  track distance — taxi fuel is in the total but not the rate),
  `fuelPhases` `{taxi,climb,cruise,descent: {sec,gal,nm}}` (on-ground =
  taxi; 30 s-smoothed VS beyond ±300 fpm = climb/descent; fuel summed from
  per-second drops so a refuel can't go negative), `windCostSec` (airborne
  time − Σ gs·dt/tas; positive = headwind cost you time; None when TAS was
  never recorded). Flights recorded before 2026-09-10 lack these — delete +
  `--replay` the dump to backfill.
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

- **LayerChart**: `ChartGroup` shares the pointer with `pointer.tooltip:
true` — the elevation chart is the group's only tooltip chart, and an
  externally set pointer (replay, a selected photo) must show the tooltip,
  which `tooltip: false` suppresses; replay drives
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
- **Wind layer**: an absolutely-positioned `<svg>` over the elevation chart
  (`pointer-events: none` so it never steals the tooltip) with one arrow per
  ~30 px of visible width at y=14 in the headroom, projected like the photo
  pins (so they follow the brush zoom). Arrows show **only the along-track
  component** (`windAt(t).headwind`, against the track's true course from
  `posAt(t).bearing`): pointing left = headwind, right = tailwind, length
  6–24 px by that component; under 2 kt (calm or pure crosswind) it's a dot.
  Direction-rotated arrows were tried and read as head/tail anyway.
- **Chart tooltip is a custom `tooltip` snippet** (`Tooltip.Root/Header/
List/Item` from layerchart, `portal={false}` so it inherits the mono
  font): header `T±elapsed`, rows Altitude / Terrain, then a separator and
  the wind rows from `windRows()` — `Wind 28 kt from 291°`, `Headwind 24 kt`
  (or Tailwind), `Crosswind 14 kt from the right` — components under half a
  knot are omitted. The `props.tooltip` header/item formatters are gone;
  format inside the snippet.
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
  `move`; **pins projecting outside the container are dropped**, or a
  brush-zoomed map leaves them floating over the page), manual scale math
  over the chart; both drive one
  popover with an `activePinArea` discriminator and a 250 ms hover-grace
  timer. Pins carry the photo's `index`; clicking a pin or its popover
  opens the carousel at that photo (nothing links to the raw R2 URL except
  the carousel image itself).
- **Photo carousel** (`slides` = the admin screenshot first when present,
  then the photo-mode shots in flight order; `slideIndex`): always open,
  never autoplays — it _is_ the hero. **The stage is a fixed 32:9 box**
  (screenshot `cover`, photos `contain`) so stepping never shifts the card
  below it. Prev/next are 2 rem squares styled like the map's play button
  (`◀`/`▶`, borderless, invert on hover), dots, a
  `k / N · T±elapsed` counter (the screenshot slide has no time); the bar
  only renders with more than one slide (or for the admin's `+ add
screenshot`). Arrow keys step while it has focus. Pins map photo index →
  slide via `photoOffset`, focus the carousel and `scrollIntoView({ block:
'nearest' })` since it sits above them. Neighbours are pre-warmed with
  `new Image()` only after the first step (a feed of cards must not pull
  extra images on load). Admin `replace` overlays the screenshot slide.
  **A selected photo parks the pointer** (`parkPointer`: `setPointer` at
  the photo's flight time, so the chart glyph + tooltip, gauges and map
  plane sit on it; the screenshot slide clears it). The tooltip's own time
  is the nearest track sample (bisect), so it can differ from the exact
  photo time in the bar by a few seconds on a sparse cruise segment.
  **Parking is one-shot** (`parked`): `pointerenter` on the chart wrapper
  releases it (chart hover scrubs, its leave clears as usual), `pointerenter`
  on the map wrapper releases _and_ clears, and a `svelte:window` click
  outside the chart / map / carousel clears it. Replay sets `parked =
  false` and owns the pointer while `playing`. Nothing parks on load.
  `showSlide` also resets `brushRange` (a brush zoom would hide a photo
  outside its window). The bar is `k / N` · dots · right-aligned
  `T±elapsed`.
- **Every image goes through Cloudflare Image Resizing** via
  `cfImage`/`cfImageSrcset` in `src/lib/utils/image.ts` (`files.davesnider.com/
cdn-cgi/image/...`; non-R2 URLs pass through). Originals are 5120×1440
  ~15 MB PNGs — never put one in an `<img>`. Sizes: hero `w=1280,h=360,
fit=cover` + a 640/1280/1920 srcset cropped to 32:9 (`sizes` = the card's
  40 rem cap); photo slides `w=1280,fit=scale-down` + the same widths uncropped;
  pin popovers a 16:9 `w=384,h=216,fit=cover` crop shown at 192 px.
- **Conditions row** (right of Wind, so the grid stays even at 12 rows on a
  full flight): `VMC`, or `IMC <time>` with `<pct>% of flight` from the
  `inCloud` channel over the airborne time; median airborne `oat` appended
  when the channel exists. Under 60 s in cloud counts as VMC.
- **Landing stars**: from `|landingRateFpm|` (≤100 → 5 … >600 → 1) minus
  one per `bounces` (floor 1); sub-label `-320 fpm · 2 bounces`.
- **Gauges**: three ArcCharts (RPM / IAS / GAL), `GAUGE_RING = -4`, limits
  matched from the aircraft title — 172: 2700 rpm / 163 kt / 56 gal;
  Comanche (pa-24): 2575 / 197 / 60; default 2700 / 180 / 60. Readouts show
  the scrubbed value, else the cruise median (fuel: value at landing).
- **Fuel stats fall back to the channels**: `derivedFuel` recomputes avg
  burn / nm-per-gal (exact: first/last airborne `fuel` sample over
  `durationSec`) and the phase split (approximate: VS from the track,
  fuel bucketed at channel resolution) for rows recorded before the recorder
  emitted them; recorder values win when present. Wind cost has no fallback
  (channels carry no TAS).
- **Fuel stats** (`AirframeProfile.book` beside the gauge limits): POH 65%
  cruise gph/KTAS per airframe (Comanche 12.5 / 150, 172 8.6 / 115 —
  real-airplane figures, adjust for the A2A model) shown as `book …` subs
  next to Avg burn and Economy (book nm/gal = KTAS/gph). Reserve at landing
  = last positive `fuel` sample as endurance at `avgFuelFlowGph`. Wind row
  gains `cost 45m` / `saved 12m` from `windCostSec` (|sec| ≥ 60); it sits
  before Max G so it lands in the left grid column.
- **Phase strip** under the elevation chart (not in the stats grid — a
  shaded table row can't read as up/steady/down; the profile above does):
  `phaseIntervals` classifies each channel interval of the airborne time by
  track slope (±300 fpm, runs < 90 s absorbed into the previous run), and
  `phaseStrip` projects them onto the visible domain as absolutely-
  positioned `%` segments (brush-zoom aware). Textures: climb = `/` hatch
  (`repeating-linear-gradient(135deg…)`), descent = `\` hatch (`45deg`),
  cruise = flat `--fg`; all three at opacity 0.25 (one colour, the texture
  carries the meaning) — solid shades alone didn't read as up/steady/down. Legend beneath = one item per phase with a
  matching swatch, `↗ Climb 4.7 gal` + a `time · gph` sub, from the stored
  (or derived) per-phase totals. Taxi has no segment or item.
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
