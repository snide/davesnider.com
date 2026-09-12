<script lang="ts">
  import type { FlightTrackPoint } from '$db/schema';
  import ActivityItemFlight from '$lib/components/ActivityItem/ActivityItemFlight.svelte';
  import { basemapStyle, loadMapLibs, mapPalette, type MapTheme } from '$lib/map';
  import { AreaChart } from 'layerchart';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { mode } from 'mode-watcher';
  import { onMount, tick } from 'svelte';
  import type { TripLeg, TripResponse, TripTarget } from './types';

  // Every leg of a challenge trip on one map, oldest first. Legs are flights
  // tagged with the trip slug on their feed card; a leg with a stop marks the
  // goal its arrival reached. Clicking a leg expands the full flight card.
  interface Props {
    trip: string;
    title?: string;
    targets?: TripTarget[];
    // Draw targets that have coordinates on the map: their logo (faded until
    // reached) or, without an icon, a ring that fills once reached.
    targetsOnMap?: boolean;
    // What the burned fuel would have cost, USD per gallon. Default is a
    // round US 100LL avgas price; override from the post as prices move.
    fuelPricePerGal?: number;
  }

  let { trip, title, targets = [], targetsOnMap = true, fuelPricePerGal = 6.5 }: Props = $props();

  let legs = $state.raw<TripLeg[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedIndex = $state<number | null>(null);
  let detailEl = $state<HTMLElement | null>(null);
  let legsEl = $state<HTMLElement | null>(null);

  type LngLat = [number, number];
  type LegView = {
    index: number;
    leg: TripLeg;
    coords: LngLat[];
    from: LngLat | null;
    to: LngLat | null;
    stopName: string | null; // display label as typed on the card
    stopNames: string[]; // individual goals: the label split on " / "
    reached: TripTarget[]; // targets matched by this leg's stops, in stop order
    startPct: number; // where this leg begins as a share of the whole trip's distance
    widthPct: number; // this leg's share of the whole trip's distance
    profile: ProfilePoint[]; // altitude over elapsed seconds, for the row's sparkline
  };
  type ProfilePoint = { t: number; alt: number };

  // One leg can reach several goals (two New York parks on one flight); the
  // card's stop field is a "/"-delimited list. Commas are allowed inside a
  // name ("Petco Park, San Diego"), which is why the delimiter is a slash.
  function splitStops(label: string | null): string[] {
    return (label ?? '')
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // Stops are typed by hand: compare case-insensitively, ignoring periods
  // and stray whitespace, against a target's name and any of its aliases.
  function normalizeName(name: string): string {
    return name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  }

  let targetsByName = $derived(
    new Map(targets.flatMap((t) => [t.name, ...(t.aliases ?? [])].map((n) => [normalizeName(n), t] as const)))
  );

  // Every row's sparkline shares one altitude ceiling (the trip's highest
  // point), so a mountain leg visibly towers over a coastal one.
  let tripMaxAlt = $derived(
    legs.reduce((max, leg) => {
      for (const p of (leg.details.track ?? []) as FlightTrackPoint[]) if (p[2] > max) max = p[2];
      return max;
    }, 0)
  );

  // Each row carries an altitude sparkline sized to its share of the trip's
  // distance and offset by everything flown before it, so the rows read as
  // slices of one profile stacked down the list.
  let views = $derived.by(() => {
    const totalNm = legs.reduce((sum, leg) => sum + (leg.details.distanceNm ?? 0), 0);
    let flownNm = 0;
    return legs.map((leg, index): LegView => {
      const track = (leg.details.track ?? []) as FlightTrackPoint[];
      const coords = track.map((p): LngLat => [p[1], p[0]]);
      const stopNames = splitStops(leg.details.tripStop);
      const nm = leg.details.distanceNm ?? 0;
      const startPct = totalNm > 0 ? (flownNm / totalNm) * 100 : 0;
      const widthPct = totalNm > 0 ? (nm / totalNm) * 100 : 0;
      flownNm += nm;
      const profile = track.length < 2 ? [] : track.map((p): ProfilePoint => ({ t: p[3], alt: Math.max(0, p[2]) }));
      return {
        index,
        leg,
        coords,
        from: coords[0] ?? null,
        to: coords.length ? coords[coords.length - 1] : null,
        stopName: leg.details.tripStop?.trim() || null,
        stopNames,
        reached: stopNames.flatMap((name) => targetsByName.get(normalizeName(name)) ?? []),
        startPct,
        widthPct,
        profile
      };
    });
  });

  type PlacedTarget = TripTarget & { lat: number; lon: number };
  let mapTargets = $derived(
    targetsOnMap ? targets.filter((t): t is PlacedTarget => t.lat != null && t.lon != null) : []
  );

  // Bounding box over the flown legs only: the map frames the path so far,
  // and targets outside it are there to pan to, not to fit. A trip
  // straddling the antimeridian would fit the long way round; not handled.
  let bounds = $derived.by((): [LngLat, LngLat] | null => {
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const v of views) {
      for (const [lon, lat] of v.coords) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    if (!Number.isFinite(minLon)) return null;
    return [
      [minLon, minLat],
      [maxLon, maxLat]
    ];
  });

  let stopSet = $derived(new Set(views.flatMap((v) => v.stopNames.map(normalizeName))));
  // Targets reached by any leg (by canonical name, so aliases count once)
  let reachedNames = $derived(new Set(views.flatMap((v) => v.reached.map((t) => t.name))));
  let reachedTargets = $derived(reachedNames.size);

  // Headline numbers across every leg.
  let stats = $derived.by(() => {
    // Keyed by ICAO type when known so a leg that lost its SimConnect title
    // still groups with its type; the display name upgrades to a full title
    // as soon as one leg has it.
    const aircraft = new Map<string, { name: string; hasTitle: boolean }>();
    let maxAltFt = 0;
    let durationSec = 0;
    let fuelGal = 0;
    let nm = 0;
    for (const { details } of legs) {
      nm += details.distanceNm ?? 0;
      const title = details.aircraftTitle?.trim() || null;
      const icao = details.aircraftIcao?.trim() || null;
      const key = (icao ?? title)?.toLowerCase();
      if (key) {
        const prev = aircraft.get(key);
        if (!prev || (title && !prev.hasTitle)) aircraft.set(key, { name: title ?? icao!, hasTitle: !!title });
      }
      maxAltFt = Math.max(maxAltFt, details.maxAltitudeFt ?? 0);
      durationSec += details.durationSec ?? 0;
      fuelGal += details.fuelBurnedGal ?? 0;
    }
    return {
      flights: legs.length,
      aircraft: [...aircraft.values()].map((a) => a.name),
      stops: stopSet.size,
      maxAltFt,
      hours: Math.round(durationSec / 360) / 10,
      fuelGal: Math.round(fuelGal * 10) / 10,
      fuelUsd: Math.round(fuelGal * fuelPricePerGal),
      nm
    };
  });

  let selected = $derived(selectedIndex == null ? null : (views[selectedIndex] ?? null));

  onMount(async () => {
    try {
      const response = await fetch(`/api/activity/trip/${trip}`);
      if (!response.ok) {
        throw new Error('Failed to fetch trip');
      }
      const data = (await response.json()) as TripResponse;
      legs = data.legs;
      selectedIndex = legs.length > 0 ? 0 : null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading = false;
    }
  });

  function targetIconFor(t: TripTarget, theme: MapTheme): string | undefined {
    return theme === 'dark' ? (t.iconDark ?? t.icon) : t.icon;
  }

  // List icon: the selected row flips bg/fg, so its logo takes the variant
  // drawn for the opposite theme.
  function targetIcon(t: TripTarget, flipped = false): string | undefined {
    const dark = (mode.current === 'dark') !== flipped;
    return targetIconFor(t, dark ? 'dark' : 'light');
  }

  function formatDuration(sec: number): string {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.round((sec % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // `scroll` brings the card into view when the selection came from the map;
  // the list and prev/next already have it on screen. The list's selected row
  // is always kept visible inside its own scroll box.
  async function select(index: number, scroll = false) {
    selectedIndex = index;
    await tick();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    const row = legsEl?.querySelector<HTMLElement>('.flightTrip__leg--selected');
    if (row && legsEl) {
      const top = row.offsetTop - legsEl.offsetTop;
      if (top < legsEl.scrollTop || top + row.offsetHeight > legsEl.scrollTop + legsEl.clientHeight) {
        legsEl.scrollTo({ top: top - legsEl.clientHeight / 2 + row.offsetHeight / 2, behavior });
      }
    }
    if (scroll) detailEl?.scrollIntoView({ block: 'nearest', behavior });
  }

  // Bridge to the map: filled in once the map has loaded, so the selection
  // effect below can re-apply after a theme rebuild.
  type MapApi = { setSelected: (index: number | null) => void };
  let mapApi = $state.raw<MapApi | null>(null);

  $effect(() => {
    mapApi?.setSelected(selectedIndex);
  });

  // Build the map inside an attachment so it only runs client-side. The theme
  // argument makes the attachment re-run (rebuilding with the matching
  // basemap flavor) when the site theme flips. `selectedIndex` is deliberately
  // not read in here — selecting a leg must not rebuild the map.
  function tripMap(theme: MapTheme) {
    return (node: HTMLElement) => {
      let map: import('maplibre-gl').Map | undefined;
      let cancelled = false;
      const legViews = views;
      const legBounds = bounds;
      const targetList = mapTargets;
      const reached = reachedNames;

      (async () => {
        const { maplibregl, basemaps } = await loadMapLibs();
        if (cancelled) return;

        const { lineColor, haloColor } = mapPalette(theme);

        const m = new maplibregl.Map({
          container: node,
          // No city or road names: the legs, airports and logos are the labels
          style: basemapStyle(basemaps, theme, { placeLabels: false, roadLabels: false }),
          // OSM credit is rendered as a static line under the map instead
          attributionControl: false,
          // Ctrl/⌘+wheel to zoom and two-finger pan on touch: the map sits in
          // the middle of an article and must not trap page scrolling.
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          ...(legBounds
            ? { bounds: legBounds, fitBoundsOptions: { padding: 48, maxZoom: 10 } }
            : { center: [-98, 39] as LngLat, zoom: 3 })
        });
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        m.touchZoomRotate.disableRotation();
        map = m;

        // Targets with an icon: the logo itself as an HTML marker (crisp
        // SVG, no rasterising), faded until reached. Clicking a reached
        // logo jumps to the first leg that got there. Markers live in the
        // map container, so map.remove() in cleanup takes them too.
        for (const t of targetList) {
          const src = targetIconFor(t, theme);
          if (!src) continue;
          const isReached = reached.has(t.name);
          const el = document.createElement('img');
          el.src = src;
          el.alt = t.name;
          el.title = t.name;
          el.draggable = false;
          el.className = isReached ? 'flightTrip__mapLogo flightTrip__mapLogo--reached' : 'flightTrip__mapLogo';
          if (isReached) {
            el.addEventListener('click', () => {
              const first = legViews.find((v) => v.reached.includes(t));
              if (first) select(first.index, true);
            });
          }
          new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([t.lon, t.lat]).addTo(m);
        }

        // style.load rather than load: load also waits on every source, and
        // never fires if the tile fetch errors (CORS from localhost, offline).
        // The overlay layers only need the style's layer stack in place.
        m.on('style.load', () => {
          // Targets without an icon: a ring, filled once reached
          const ringTargets = targetList.filter((t) => !targetIconFor(t, theme));
          if (ringTargets.length > 0) {
            m.addSource('trip-targets', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: ringTargets.map((t) => ({
                  type: 'Feature',
                  properties: { name: t.name, reached: reached.has(t.name) },
                  geometry: { type: 'Point', coordinates: [t.lon, t.lat] }
                }))
              }
            });
            m.addLayer({
              id: 'trip-targets-circle',
              type: 'circle',
              source: 'trip-targets',
              paint: {
                'circle-radius': 5,
                'circle-color': ['case', ['get', 'reached'], lineColor, 'rgba(0, 0, 0, 0)'],
                'circle-stroke-color': lineColor,
                'circle-stroke-width': 1.5,
                'circle-opacity': 0.9
              }
            });
            m.addLayer({
              id: 'trip-targets-label',
              type: 'symbol',
              source: 'trip-targets',
              // Reached targets are labelled by their stop instead
              filter: ['!', ['get', 'reached']],
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 10,
                'text-anchor': 'top',
                'text-offset': [0, 0.8],
                'text-optional': true
              },
              paint: {
                'text-color': lineColor,
                'text-halo-color': haloColor,
                'text-halo-width': 1.5,
                'text-opacity': 0.7
              }
            });
          }

          m.addSource('trip-legs', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: legViews
                .filter((v) => v.coords.length >= 2)
                .map((v) => ({
                  type: 'Feature',
                  properties: { legIndex: v.index, activityId: v.leg.activityId },
                  geometry: { type: 'LineString', coordinates: v.coords }
                }))
            }
          });
          m.addLayer({
            id: 'trip-legs-line',
            type: 'line',
            source: 'trip-legs',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': lineColor, 'line-width': 2, 'line-opacity': 0.5 }
          });
          m.addLayer({
            id: 'trip-legs-selected',
            type: 'line',
            source: 'trip-legs',
            filter: ['==', ['get', 'legIndex'], -1],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': lineColor, 'line-width': 3.5 }
          });
          // Wide invisible twin of the track line so thin legs are clickable
          m.addLayer({
            id: 'trip-legs-hit',
            type: 'line',
            source: 'trip-legs',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': lineColor, 'line-width': 14, 'line-opacity': 0 }
          });

          // Airports at every departure/arrival (deduped), stops on top
          type PointProps = { kind: 'airport' | 'stop'; label: string };
          const points = new Map<string, { coord: LngLat; props: PointProps }>();
          const key = (c: LngLat) => `${c[1].toFixed(3)},${c[0].toFixed(3)}`;
          for (const v of legViews) {
            if (v.from)
              points.set(key(v.from), { coord: v.from, props: { kind: 'airport', label: v.leg.details.originIcao } });
            if (v.to) points.set(key(v.to), { coord: v.to, props: { kind: 'airport', label: v.leg.details.destIcao } });
          }
          // Stop labels at the arrival airport, minus any goal already shown
          // as a logo on the map (a bare stop with no target still labels).
          const drawnTargets = new Set<TripTarget>(targetList.filter((t) => targetIconFor(t, theme)));
          for (const v of legViews) {
            if (!v.to || v.stopNames.length === 0) continue;
            const label = v.stopNames
              .filter(
                (name) => !v.reached.some((t) => drawnTargets.has(t) && targetsByName.get(normalizeName(name)) === t)
              )
              .join(' / ');
            if (label) points.set(key(v.to), { coord: v.to, props: { kind: 'stop', label } });
          }
          m.addSource('trip-points', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [...points.values()].map((p) => ({
                type: 'Feature',
                properties: p.props,
                geometry: { type: 'Point', coordinates: p.coord }
              }))
            }
          });
          m.addLayer({
            id: 'trip-airports-circle',
            type: 'circle',
            source: 'trip-points',
            filter: ['==', ['get', 'kind'], 'airport'],
            paint: {
              'circle-radius': 3.5,
              'circle-color': lineColor,
              'circle-stroke-color': haloColor,
              'circle-stroke-width': 1.5
            }
          });
          m.addLayer({
            id: 'trip-stops-circle',
            type: 'circle',
            source: 'trip-points',
            filter: ['==', ['get', 'kind'], 'stop'],
            paint: {
              'circle-radius': 6,
              'circle-color': haloColor,
              'circle-stroke-color': lineColor,
              'circle-stroke-width': 2
            }
          });
          m.addLayer({
            id: 'trip-airports-label',
            type: 'symbol',
            source: 'trip-points',
            filter: ['==', ['get', 'kind'], 'airport'],
            layout: {
              'text-field': ['get', 'label'],
              'text-font': ['Noto Sans Regular'],
              'text-size': 10,
              'text-anchor': 'bottom',
              'text-offset': [0, -0.7],
              'text-optional': true
            },
            paint: {
              'text-color': lineColor,
              'text-halo-color': haloColor,
              'text-halo-width': 1.5,
              'text-opacity': 0.8
            }
          });
          m.addLayer({
            id: 'trip-stops-label',
            type: 'symbol',
            source: 'trip-points',
            filter: ['==', ['get', 'kind'], 'stop'],
            layout: {
              'text-field': ['get', 'label'],
              'text-font': ['Noto Sans Medium'],
              'text-size': 11,
              'text-anchor': 'top',
              'text-offset': [0, 0.9]
            },
            paint: { 'text-color': lineColor, 'text-halo-color': haloColor, 'text-halo-width': 1.5 }
          });

          m.on('click', 'trip-legs-hit', (e) => {
            const index = e.features?.[0]?.properties?.legIndex;
            if (typeof index === 'number') select(index, true);
          });
          m.on('mouseenter', 'trip-legs-hit', () => {
            m.getCanvas().style.cursor = 'pointer';
          });
          m.on('mouseleave', 'trip-legs-hit', () => {
            m.getCanvas().style.cursor = '';
          });

          mapApi = {
            setSelected: (index) => {
              if (!m.getLayer('trip-legs-selected')) return;
              m.setFilter('trip-legs-selected', ['==', ['get', 'legIndex'], index ?? -1]);
            }
          };
        });
      })();

      return () => {
        cancelled = true;
        mapApi = null;
        map?.remove();
      };
    };
  }
</script>

<section class="flightTrip">
  {#if title}
    <h2 class="flightTrip__title">{title}</h2>
  {/if}
  {#if loading}
    <div class="flightTrip__loading">Loading trip...</div>
  {:else if error}
    <div class="flightTrip__error">{error}</div>
  {:else if legs.length === 0}
    <div class="flightTrip__empty">No legs tagged yet.</div>
  {:else}
    <div class="flightTrip__stats">
      <div class="flightTrip__stat">
        <span class="flightTrip__statValue">{stats.flights}</span>
        <span class="flightTrip__statLabel">{stats.flights === 1 ? 'flight' : 'flights'}</span>
      </div>
      <div class="flightTrip__stat">
        <span class="flightTrip__statValue">{stats.nm.toLocaleString()}</span>
        <span class="flightTrip__statLabel">nm flown</span>
      </div>
      <div class="flightTrip__stat">
        <span class="flightTrip__statValue">
          {targets.length > 0 ? `${reachedTargets} / ${targets.length}` : stats.stops}
        </span>
        <span class="flightTrip__statLabel">
          {targets.length > 0 ? 'stadiums' : stats.stops === 1 ? 'stop' : 'stops'}
        </span>
      </div>
      <div class="flightTrip__stat">
        <span class="flightTrip__statValue">{stats.maxAltFt.toLocaleString()}</span>
        <span class="flightTrip__statLabel">ft max altitude</span>
      </div>
      <div class="flightTrip__stat">
        <span class="flightTrip__statValue">{stats.hours.toLocaleString()}</span>
        <span class="flightTrip__statLabel">hours flown</span>
      </div>
      <div class="flightTrip__stat">
        <span class="flightTrip__statValue">{stats.fuelGal.toLocaleString()}</span>
        <span class="flightTrip__statLabel">gal fuel burned</span>
      </div>
      <div class="flightTrip__stat" title="at ${fuelPricePerGal.toFixed(2)} per gallon">
        <span class="flightTrip__statValue">${stats.fuelUsd.toLocaleString()}</span>
        <span class="flightTrip__statLabel">in fuel</span>
      </div>
      <div class="flightTrip__stat" title={stats.aircraft.join(', ')}>
        <span class="flightTrip__statValue">{stats.aircraft.length}</span>
        <span class="flightTrip__statLabel">{stats.aircraft.length === 1 ? 'aircraft' : 'aircraft flown'}</span>
      </div>
    </div>
    <div class="flightTrip__map" {@attach tripMap(mode.current === 'dark' ? 'dark' : 'light')}></div>
    <div class="flightTrip__attribution">
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>
    </div>
    <div class="flightTrip__body">
      <div class="flightTrip__legsWrap">
        <ol class="flightTrip__legs" bind:this={legsEl}>
          {#each views as v (v.leg.activityId)}
            <li class="flightTrip__legItem">
              <button
                class="flightTrip__leg"
                class:flightTrip__leg--selected={v.index === selectedIndex}
                class:flightTrip__leg--stop={v.stopName !== null}
                type="button"
                aria-pressed={v.index === selectedIndex}
                onclick={() => select(v.index)}
              >
                <span class="flightTrip__legText">
                  <span class="flightTrip__legRoute">{v.leg.details.originIcao} → {v.leg.details.destIcao}</span>
                  <span class="flightTrip__legMeta">
                    {formatDate(v.leg.details.departureTs)} · {formatDuration(v.leg.details.durationSec)}
                  </span>
                  {#if v.stopName}
                    <span class="flightTrip__legStop">{v.stopName}</span>
                  {/if}
                </span>
                {#if v.reached.some((t) => targetIcon(t))}
                  <span class="flightTrip__legIcons">
                    {#each v.reached as t (t.name)}
                      {@const src = targetIcon(t, v.index === selectedIndex)}
                      {#if src}
                        <img class="flightTrip__legIcon" {src} alt="" title={t.name} loading="lazy" />
                      {/if}
                    {/each}
                  </span>
                {/if}
                {#if v.profile.length > 0}
                  <div class="flightTrip__legBar" style="left: {v.startPct}%; width: {v.widthPct}%" aria-hidden="true">
                    <AreaChart
                      data={v.profile}
                      x="t"
                      y="alt"
                      yDomain={[0, tripMaxAlt]}
                      yNice={false}
                      padding={0}
                      axis={false}
                      grid={false}
                      rule={false}
                      legend={false}
                      brush={false}
                      tooltipContext={false}
                      highlight={false}
                      series={[{ key: 'alt', value: (d: ProfilePoint) => d.alt, color: 'currentColor' }]}
                      props={{ area: { 'fill-opacity': 0.3 } }}
                    />
                  </div>
                {/if}
              </button>
            </li>
          {/each}
        </ol>
      </div>
      {#if selected}
        <div class="flightTrip__detail" bind:this={detailEl}>
          <!-- Keyed so the card's chart group, replay, pins and map reset per leg -->
          {#key selected.leg.activityId}
            <ActivityItemFlight
              details={selected.leg.details}
              timestamp={selected.leg.timestamp}
              isPrivate={false}
              isAdmin={false}
              onHide={() => {}}
              embedded
            />
          {/key}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .flightTrip {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .flightTrip__title {
    margin: 0;
  }

  .flightTrip__loading,
  .flightTrip__error,
  .flightTrip__empty {
    text-align: center;
    padding: 2rem;
    color: var(--subtle);
    font-family: var(--codeFont);
  }

  .flightTrip__stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .flightTrip__stat {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--visBg);
    font-family: var(--codeFont);
  }

  .flightTrip__statValue {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .flightTrip__statLabel {
    color: var(--subtle);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .flightTrip__map {
    width: 100%;
    height: 32rem;
    overflow: hidden;
    background: var(--subtle);
    border: 1px solid var(--visBg);
  }

  .flightTrip__map :global(.flightTrip__mapLogo) {
    width: 26px;
    height: 26px;
    object-fit: contain;
    opacity: 0.3;
    filter: grayscale(1);
    transition: opacity 0.15s;
  }

  .flightTrip__map :global(.flightTrip__mapLogo--reached) {
    opacity: 1;
    filter: none;
    cursor: pointer;
  }

  .flightTrip__map :global(.flightTrip__mapLogo:hover) {
    opacity: 1;
  }

  .flightTrip__attribution {
    text-align: right;
    font-family: var(--codeFont);
    font-size: 0.625rem;
    margin-top: -0.5rem;
  }

  .flightTrip__attribution a {
    color: var(--subtle);
    text-decoration: none;
  }

  .flightTrip__attribution a:hover {
    text-decoration: underline;
  }

  /* List beside the card. The list is absolutely positioned inside a
     stretched grid cell so it never sets the row height: the card does,
     and the list scrolls within that height. */
  /* The card keeps the activity feed's column width (40rem); whatever is
     left over goes to the leg list. */
  .flightTrip__body {
    display: grid;
    grid-template-columns: minmax(17rem, 1fr) minmax(0, 40rem);
    gap: 1.5rem;
    align-items: stretch;
    margin-top: 1rem;
  }

  .flightTrip__legsWrap {
    position: relative;
    min-height: 16rem;
  }

  .flightTrip__legs {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0;
    scrollbar-width: thin;
  }

  .flightTrip__legItem {
    margin: 0;
    padding: 0;
  }

  .flightTrip__leg {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    text-align: left;
    font-family: var(--codeFont);
    font-size: 0.8125rem;
    color: var(--subtle);
    background: none;
    border: none;
    padding: 0.6rem 0.75rem 1.1rem;
    cursor: pointer;
  }

  .flightTrip__leg:hover {
    color: var(--fg);
  }

  .flightTrip__leg:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: -2px;
  }

  .flightTrip__leg--selected,
  .flightTrip__leg--selected:hover {
    color: var(--bg);
    background: var(--fg);
  }

  .flightTrip__leg--selected .flightTrip__legStop {
    color: inherit;
  }

  /* This leg's altitude sparkline in its slice of the trip, offset by the
     legs before it. Drawn in currentColor so it follows the row's color,
     including the bg/fg flip on the selected row. */
  .flightTrip__legBar {
    position: absolute;
    bottom: 0;
    height: 0.875rem;
    display: block;
    opacity: 0.45;
    pointer-events: none;
  }

  .flightTrip__leg:hover .flightTrip__legBar {
    opacity: 0.7;
  }

  .flightTrip__leg--selected .flightTrip__legBar {
    opacity: 1;
  }

  .flightTrip__leg--stop .flightTrip__legRoute {
    font-weight: 600;
  }

  .flightTrip__legText {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .flightTrip__legMeta,
  .flightTrip__legStop {
    font-size: 0.6875rem;
  }

  .flightTrip__legIcons {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: none;
  }

  .flightTrip__legIcon {
    width: 2rem;
    height: 2rem;
    object-fit: contain;
    display: block;
  }

  .flightTrip__legStop {
    color: var(--fg);
  }

  .flightTrip__detail {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  @media (max-width: 768px) {
    .flightTrip__stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .flightTrip__map {
      height: 20rem;
    }

    /* Stacked: the list becomes a capped scroll box above the card */
    .flightTrip__body {
      grid-template-columns: minmax(0, 1fr);
    }

    .flightTrip__legsWrap {
      min-height: 0;
    }

    .flightTrip__legs {
      position: static;
      max-height: 14rem;
    }
  }
</style>
