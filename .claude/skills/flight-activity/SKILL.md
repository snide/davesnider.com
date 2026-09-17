---
name: flight-activity
description: The MSFS flight pipeline end to end — the SimConnect recorder (gate, block-time detection, pause compression, telemetry channels, photo matching), flight/photo/screenshot endpoints, the ActivityItemFlight card (LayerChart group sync, MapLibre PMTiles map, gauges, photo pins, replay), PMTiles hosting, and the Linux replay dev loop. Load when touching flight-recorder/, the flight ingest/photo/screenshot routes, ActivityItemFlight.svelte, or the tiles/vite config that serves them.
---

# MSFS flight pipeline

> **Freshness**: last verified 2026-09-14 against layerchart 2.3.1, maplibre-gl 6.6, @protomaps/basemaps 5.7, Svelte 5.56, Python-SimConnect 0.4 (Turbine Duke airframe profile + prop-RPM gauge, photo carousel + Cloudflare image resizing, fuel stats, wind layer, landing record + panel, 10 Hz near-ground polling).
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

- `sources.py` — **one batched SimConnect data definition**, not the
  wrapper's per-variable `Request`s: those cost a round trip plus a 10 ms
  sleep (15.6 ms on Windows) EACH, so ~35 variables made a poll take most
  of a second and the "10 Hz near the ground" never happened (the
  2026-09-14 KO69 pattern flight sampled at ~1 Hz). `SIMVARS` lists
  (field, simvar, **explicit unit**) in struct order; `RecorderSimConnect`
  (a subclass of the wrapper's connection) receives the struct every
  visual frame (`RECV_ID_SIMOBJECT_DATA`, id 8, which the wrapper itself
  ignores) and keeps the latest copy; `_poll` decodes it (`decode_batch`)
  at 1 Hz, **10 Hz** airborne under 50 ft AGL or on the ground above
  30 kt. A simvar the sim rejects (exception matched by send id) is
  dropped and the definition rebuilt. Units are requested from
  SimConnect directly (degrees, feet per minute…) so nothing is converted
  on our side — the old ×60 and radians incidents came from the wrapper's
  unit table. `TITLE` is the one string, refreshed every 5 s via the
  wrapper. Staleness watchdog: struct older than 2 s = no sample; 120 s
  of that recycles the connection (a session opened at the main menu
  binds dead requests). Menus report lat/lon 0,0. **Raw signs are kept
  in the dump**; `landing.py` owns the conventions.
  **The wrapper's bundled SimConnect.dll predates the facility API**
  (`SimConnect_AddToFacilityDefinition` missing — seen 2026-09-15):
  `find_simconnect_dll()` prefers `SIMCONNECT_DLL`, then the MSFS 2024 /
  2020 SDK folders (env vars `MSFS2024_SDK` / `MSFS_SDK`, else `C:\MSFS …
SDK`), else the bundled one; `facility_supported` is checked at connect
  and logged once, and `runway_ends` returns None without it (README has
  the user steps). **At the main menu the data request fails with E_FAIL**
  (`OSError -2147467259`): `_define_batch` is retried every 5 s on the same
  connection instead of recycling it. Menu positions sit on the equator
  (0,0 and 0,90 seen) — any |lat| < 0.01 is dropped.
  **Runway geometry comes from the sim** (`runway_ends(icao, near)`:
  `AddToFacilityDefinition` OPEN AIRPORT / OPEN RUNWAY … CLOSE, fields in
  `FACILITY_RUNWAY_FIELDS` order — 8-byte fields first so packing is
  unambiguous — `RequestFacilityData`, messages id 28/29 parsed by
  `parse_facility_message`, `runway_ends_from_facility` turns the centre
  - primary heading + length into both thresholds; idents tried as given
    then without a leading K (`icao_candidates`: OurAirports `KO69` is the
    sim's `O69`); 4 s timeout; answers farther than 3 nm from the touchdown
    rejected). `cli.runway_ends_for` order: `SimRunwayCache`
    (`~/.flight-recorder/sim_runways.json`, persisted so replays — Linux
    too, given the file — use the sim's runway) → the source's
    `runway_ends` (live connection; **a replay on Windows borrows a
    short-lived connection when the sim is running**, `FacilityClient`
    holds the shared request logic) → OurAirports `RunwayIndex`. **All of the SimConnect side is untested on Linux**:
    first flight after a change, read `recorder.log` for "batched N
    simvars", "sim runways for", "rejected by the sim", "timed out",
    "answered with N message(s) but no runway parsed" (followed by one
    `facility message: size= req= type= list= item= payload[..]=hex` line
    per message — decode the hex against `FACILITY_RUNWAY_STRUCT`), and
    "facility call … rejected by the sim" (a field name the SDK doesn't
    accept; displaced thresholds were one — they are child sections, not
    runway fields). An unknown ident (KO69 vs the sim's O69) never gets an
    END and shows as a 4 s timeout before the next candidate.
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
  touchdown's rate is the **hardest of its readings** (sensor, sampled
  VSI, sampled world velocity — each can under-read, none overstates by
  much); `landing_rate_fpm` is the hardest touchdown and `bounces` =
  touchdowns − 1 **for the full stop**. The latched touchdown position
  moving while continuously on the ground is a second between-polls skip
  signal. Latches are "fresh" against the **last value already attributed
  to a touchdown of this landing** (a second touchdown must not inherit
  the first's reading), and a latch change within 0.5 s of the current
  touchdown is folded into it — the velocity and position latches update
  on different frames (KO69 2026-09-15 read one skip as two touchdowns). **A touch-and-go is kept as a landing of its own**
  (`LandingEvent(kind="touchAndGo", liftoff_ts)`), the flight goes on, and
  `Flight.landings` lists every landing in order with the `stop` last
  (flight 862, KO69 pattern work, has three touch-and-gos + the stop —
  before this they were discarded and only the last landing existed).
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
  `--replay` the dump to backfill. Flights before 2026-09-14 lack `landings`;
  a replay of their dump produces one from the sampled channels only (no
  latches, no gear, 1 Hz near the ground on the oldest).
- `landing.py` — every landing as its own record (`landings: [...]` in the
  payload, one per `LandingEvent`, touch-and-gos first; `kind`, and for a
  touch-and-go `liftoffT` — its rollout is the ground roll up to the wheels
  leaving and the segment runs ~5 s into the climb-out; the runway is
  matched per landing): a ≤600-point segment from 45 s before the first touchdown to
  the end of the rollout (GS < 25 kt, or +60 s) — `t` (s from first
  touchdown), `agl` (above the wheels-on-ground reading), `vs`, `ias`,
  `g`, `bank`, `hdg` (true, when recorded), `x`/`d` in a **runway frame**
  (ft right of the centerline / past the threshold, displaced threshold
  applied) — plus one record per touchdown (`fpm` + the three readings,
  peak G ±1 s, bank/pitch/heading from **the last airborne sample first,
  the sim's touchdown latches only as fallback** (at the first on-ground
  sample a latch can still hold the previous landing: a 177° crab came
  from a runway-11 leftover), crab = true heading − ground course, drift, IAS, GS,
  x/d, which gear compressed first, **wind at the wheels**: `windKt`,
  `windDirDeg` (true), `headwindKt`/`crosswindKt` split against the frame
  axis, crosswind + = from the right) and rollout quality
  (`centerlineMaxFt`/`headingMaxDeg` while > 25 kt **and before a
  committed turn-off** — `_turn_start`: the heading deviation reaches 8°
  and never drops below 5° again, and the rollout ends where that
  deviation started growing; a swerve that returns is kept. A fixed 20°
  cutoff let a 30° high-speed exit at KSTL count 140 ft of taxiway
  (2026-09-17). `rolloutEndT` (s after touchdown) is emitted and the card
  draws the ground track solid to it and dotted after, `floatSec` from
  10 ft, `gearFirst`, `runway`, `touchdownFt`, `windMinKt`/`windMaxKt` =
  the gust range over the last 30 s of final — steady wind + a sinking
  flare is power, a wind that swings is the air). The runway comes from
  OurAirports `runways.csv` (`RunwayIndex` in `enrich.py`, cached beside
  `airports.csv`; the published heading, with the bearing between the two
  ends as the fallback — at KO69 the ends' bearing is 306.4° but the
  aircraft rolled out on ~305°, so the end coordinates are the weaker
  datum there. **The database centerline can be displaced from the MSFS
  runway**: the 2026-09-14 KO69 pattern flight sits a steady ~36 ft left
  of it through two whole approaches and rollouts, i.e. the sim's runway
  is ~36 ft from the database line; the sim's own facility data is the
  fix, not tuning the database): heading within 30° of the approach course, touchdown within
  500 ft of the centerline, nearest centerline wins. **No match → frame =
  approach course through the first touchdown** (`runway`/`touchdownFt`
  null, `d` from the touchdown). Sign conventions (bank + = right wing
  low, pitch + = nose up, crab + = nose right of track) are applied here
  from the sim's raw values and **are not yet verified against a real
  dump** — flip `_bank_right`/`_pitch_up` if a known wing-low landing
  reads backwards.
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
  arrays ≤500; rpm/fuelFlow/fuel/ground optional), pauses (≤50), `landings`
  (≤24 `FlightLanding`s: kind enum, parallel arrays ≤600, ≤12 touchdowns,
  gear enum, runway shape). Duplicates (same `externalId`) skip — **unless
  the item carries `replace: true`**, which only an explicit recorder replay
  sets: then every recorder-computed column is rewritten in place
  (`flightColumns`), `screenshotUrl`/`trip`/`tripStop`/`photos` are kept,
  **and the activity's `isPrivate` is cleared** — the feed's "Hide" is a
  soft delete, so a hidden-then-replayed flight comes back; counted as
  `updated`.
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
- **Landing panel** (`FlightLanding.svelte`, block `landingPanel`, last
  section of `flightCard__viz` under the map, wrapped in `landingEl` so
  its clicks don't count as outside clicks; **one landing at a time** —
  the full stop by default, and with more than one landing a
  `flightCard__landingNav` stepper (`◀` / `▶` buttons styled like the
  carousel's, the current landing's name + `T+` time, a `k / N` counter,
  wrapping at both ends — a dozen pattern landings must not wrap a tab
  row) picks another; rows without `landings` get a plain
  `Landing -244 fpm · 1 bounce` stat row — **the star rating is
  gone**, it scored the 1 Hz VS sample). Two inline SVGs sized by
  `bind:clientWidth`: the **flare profile** (AGL over the last 30 s to
  6 s after the last touchdown, 10 s grid, dashed 10 ft float line, **a
  dashed reference path when the profile has a `vrefKt`**: 3° glide at
  Vref minus the recorded headwind (sink fpm ≈ 5 × GS kt) into a quadratic
  round-out from 20 ft ending at the touchdown moment, labelled `3° at
Vref · N fpm` — the gap to the flown line is the float or the dive, one
  tick + fpm label per touchdown alternating rows when < 52 px apart,
  hover crosshair with a mono tooltip, invisible buttons over the ticks
  that call `parkAt(touchdownT + td.t)` on the card — same one-shot
  parking as a photo) and the **rollout strip** (runway from above,
  landing direction left→right, right of centerline drawn below; **a fixed
  scale when the runway is known** — the strip spans one runway width either
  side of the centerline, so the pavement is the same height on every
  landing and they compare directly; a track that leaves the strip is
  clipped (it left the runway by a lot) — else scaled to the drift with a
  50 ft bar; **the
  horizontal range is the whole runway** (threshold bar at the left, a
  far-end bar labelled with the length at the right, ticks at fixed
  positions, so touchdown points and rollout lengths compare between
  landings; a track past either end extends the range), dashed
  centerline (broken around the paint), a fainter pre-threshold pad (20%
  of the length) carrying up to three chevrons pointing at the threshold
  bar — real marking order: arrows, bar, number — the designator painted
  just past the threshold (rotated 90° so it reads to a pilot
  arriving from the left, muted fill, the centerline blanked behind it),
  airborne tail dashed, touchdown dots with a surface ring, distance ticks). Above
  them, a two-column label/value table in the flight stats' style
  (`landingPanel__statRow`) of **always exactly ten rows** (`—` when a
  value is missing, so the columns stay even and stepping between landings
  never shifts the layout): touchdown fpm (hardest; title = the three
  readings), wind (`8–14 kt 300°`: a range when final swung > 3 kt, true
  direction, `7 kt head` sub; Peak G left the table, Max G is in the
  flight stats), crosswind (`4 kt from right`; replaced the bounces row —
  the header already says `N touchdowns`), crab `5.0° left`, airspeed with
  a `vs Vref` sub from the profile's `vrefKt` (Comanche 70, 172 62, Duke
  100), past threshold, off centerline, heading swing, float from 10 ft,
  first contact. Bank is recorded but not shown (sign unverified); a
  touch-and-go's `s on the ground` goes in the header line. Every landing's
  first touchdown is an `AnnotationPoint` on the elevation chart
  (`flightCard__tdTick`, hollow `--touchAndGo` modifier). The panel's
  title/caption read `Touch-and-go` / `Ground roll` for that kind.
- **Gauges**: three ArcCharts (RPM / IAS / GAL), `GAUGE_RING = -4`, limits
  matched from the aircraft title (`AirframeProfile`) — 172: 2700 rpm /
  163 kt / 56 gal; Comanche (pa-24): 2575 / 197 / 60; Black Square Turbine
  Duke (`turbine duke` / `b60t`): 2200 / 198 / 266 with `propGearRatio: 15`;
  default 2700 / 180 / 60. **Turboprops record shaft speed, not prop RPM**:
  `GENERAL_ENG_RPM:1` on the Duke sits at exactly 33,000 through takeoff,
  cruise and descent whatever the fuel flow (governed prop, 2,200 × the
  PT6A's 15:1 box; ~20,100 at ground idle) — it is neither Ng nor prop
  RPM, so the profile's `propGearRatio` divides it and the gauge is
  labelled `PROP`. Readouts show the scrubbed value, else the cruise median
  (fuel: value at landing).
  Layout: the 240° arc leaves the bottom quarter of the dial box empty, so
  `flightCard__gaugeCell` is `calc(var(--gaugeH) * 0.75)` tall and the dial
  overflows it — never a negative margin, which the post page's
  `.flightTrip *` reset zeroes.
- **Fuel stats fall back to the channels**: `derivedFuel` recomputes avg
  burn / nm-per-gal (exact: first/last airborne `fuel` sample over
  `durationSec`) and the phase split (approximate: VS from the track,
  fuel bucketed at channel resolution) for rows recorded before the recorder
  emitted them; recorder values win when present. Wind cost has no fallback
  (channels carry no TAS).
- **Fuel stats** (`AirframeProfile.book` beside the gauge limits): POH
  cruise gph/KTAS per airframe with a `setting` label for the tooltip
  (Comanche 12.5 / 150 and 172 8.6 / 115 at `65% power cruise` —
  real-airplane figures, adjust for the A2A model; Turbine Duke 90 / 264 at
  `normal cruise, FL200`, both engines, from Black Square's own manual
  tables) shown as `book …` subs next to Avg burn and Economy (book nm/gal =
  KTAS/gph). FlightTrip's `fuelPricePerGal` default is a 100LL price; a
  Jet A airframe on a trip shares it unless the post overrides. Reserve at landing
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
  group, replay rAF, pins and map reset per leg. The selected row flips
  bg/fg (its stadium logos take the opposite-theme variant). Each row
  carries a small `flightTrip__legBar` at its bottom, a
  LayerChart `AreaChart` sparkline (axis/grid/tooltip/highlight off,
  `padding={0}`) of altitude over the track's time offsets with `yDomain`
  `[0, tripMaxAlt]` so every row shares the trip's ceiling. Its left/width
  are the leg's start and share of total trip distance, so the rows stack
  into one profile. Series color is `currentColor`, so it follows the
  row's color, including the selected flip.
  Headline tiles: flights, nm, stops/stadiums, max altitude, hours flown
  (summed `durationSec`), fuel gal/$, aircraft.
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
- Reprocessing a real flight after recorder fixes: pull on the PC, then
  `uv run flight-recorder --replay-last` (newest dump; `--replay-last N`
  for the N newest, oldest first; `--replay <csv>` for any) — replays send
  `replace: true` and the site updates the flight in place, so no DELETE
  is needed any more. Dumps live in `~/.flight-recorder/flights/`;
  `-inprogress` snapshots are never picked by `--replay-last`. **The
  samples don't carry the aircraft title**: the live recorder writes a
  `<departure>.json` sidecar (`{"aircraftTitle"}`) that `ReplaySource`
  reads; `--aircraft "…"` overrides it for older dumps, and the server's
  replace path never blanks a stored title/ICAO with a null one (a
  title-less replay of the 2026-09-17 KSTL Duke leg dropped its profile —
  no Vref, no reference line, shaft RPM on the gauge).
- Old dumps stay replayable: the CSV reader defaults missing columns.

## Anchor files (freshness check)

- `flight-recorder/flight_recorder/{sources,gate,detector,landing,enrich,payload,photos,push,cli}.py`
- `flight-recorder/README.md` — Windows install/build/exe steps
- `src/routes/api/activity/ingest/flight/+server.ts` (+ `photo/`)
- `src/routes/api/activity/flight/[id]/screenshot/+server.ts` (+ `trip/`)
- `src/routes/api/activity/trip/[slug]/+server.ts`
- `src/lib/map/basemap.ts` — shared worker URL / protocol / style / palette
- `src/lib/components/ActivityItem/ActivityItemFlight.svelte`
- `src/lib/components/ActivityItem/FlightLanding.svelte`
- `src/lib/components/FlightTrip/FlightTrip.svelte`
- `vite.config.ts` — noExternal / optimizeDeps blocks
- `.github/workflows/flight-recorder-build.yml`

## Keeping this skill current

If this document contradicts the code, trust the code, then update this file
in the same PR. Changes to the recorder's time model (block time, pauses,
t=0), the payload/channel shapes, the endpoint contracts, the card's
sync/projection math, or the tiles/vite requirements must be reflected here
(and Windows-facing steps in `flight-recorder/README.md`).
