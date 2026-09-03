<script lang="ts">
  import type { FlightChannels, FlightTrackPoint, SelectActivityFlight } from '$db/schema';
  import { ArcChart, AreaChart, ChartGroup, type ChartGroupState } from 'layerchart';
  import 'maplibre-gl/dist/maplibre-gl.css';
  // Vite-bundled URL for MapLibre's worker: the library's own worker loading
  // goes through the dep-optimizer cache, which serves it with a broken MIME
  // type in dev. ?worker&url makes Vite bundle it as a proper asset instead.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import { mode } from 'mode-watcher';
  import ActivityItem from './ActivityItem.svelte';

  interface Props {
    details: SelectActivityFlight;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide }: Props = $props();

  // PMTiles basemap served straight from R2 via HTTP range requests — no tile
  // server. See flight-recorder/README.md for how the archive is built/hosted.
  const TILES_URL = 'https://files.davesnider.com/tiles/planet.pmtiles';
  const BASEMAP_ASSETS = 'https://protomaps.github.io/basemaps-assets';

  // Material "flight" glyph, drawn onto a canvas for the map's plane marker.
  // 24x24 viewBox, pointing north so icon-rotate can take the track bearing.
  const PLANE_PATH =
    'M21.5 15.5v-2l-8-5V3.06c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5V8.5l-8 5v2l8-2.5v5.5l-2 1.5V21l3.5-1 3.5 1v-1.5l-2-1.5V13l8 2.5z';

  // Ionicons "airplane": a level side-view jet, nose right, used as the
  // chart's scrub marker. 512x512 viewBox, scaled down at render time.
  const PLANE_SIDE_PATH =
    'M186.62 464H160a16 16 0 0 1-14.57-22.6l64.46-142.25L113.1 297l-35.3 42.77C71.07 348.23 65.7 352 52 352H34.08a17.66 17.66 0 0 1-14.7-7.06c-2.38-3.21-4.72-8.65-2.44-16.41l19.82-71c.15-.53.33-1.06.53-1.58a.38.38 0 0 0 0-.15 14.82 14.82 0 0 1-.53-1.59l-19.84-71.45c-2.15-7.61.2-12.93 2.56-16.06a16.83 16.83 0 0 1 13.6-6.7H52c10.23 0 20.16 4.59 26 12l34.57 42.05 97.32-1.44-64.44-142A16 16 0 0 1 160 48h26.91a25 25 0 0 1 19.35 9.8l125.05 152 57.77-1.52c4.23-.23 15.95-.31 18.66-.31C463 208 496 225.94 496 256c0 9.46-3.78 27-29.07 38.16-14.93 6.6-34.85 9.94-59.21 9.94-2.68 0-14.37-.08-18.66-.31l-57.76-1.54-125.36 152.2a25 25 0 0 1-19.32 9.55z';

  let track = $derived((details?.track ?? []) as FlightTrackPoint[]);
  let hasTrack = $derived(track.length >= 2);

  // `time` is a real Date so LayerChart uses a time scale — the axis and
  // tooltip header then format as clock times natively. `t` stays as the
  // track offset for plane-position lookup.
  type ChartPoint = { t: number; time: Date; alt: number; lat: number; lon: number };
  let chartData = $derived(
    track.map((p) => ({
      lat: p[0],
      lon: p[1],
      alt: p[2],
      t: p[3],
      time: new Date((details.departureTs + p[3]) * 1000)
    })) as ChartPoint[]
  );

  // 25% headroom so the cruise plateau doesn't touch the top x-axis row
  let yCeil = $derived(Math.max(...track.map((p) => p[2]), 1) * 1.25);

  let channels = $derived((details?.channels ?? null) as FlightChannels | null);

  // Altitude at a channel time offset, interpolated from the track
  function altAt(t: number): number {
    const pos = track.length ? posAt(t) : null;
    if (!pos) return 0;
    // posAt gives lat/lon; altitude needs its own interpolation
    let i = 0;
    while (i < track.length - 2 && track[i + 1][3] < t) i++;
    const [, , alt0, t0] = track[i];
    const [, , alt1, t1] = track[i + 1];
    const f = t1 > t0 ? (Math.max(t0, Math.min(t1, t)) - t0) / (t1 - t0) : 0;
    return alt0 + (alt1 - alt0) * f;
  }

  // Contiguous in-cloud runs -> boxes on the elevation profile bounded in
  // BOTH axes: the time you were IMC and the altitudes occupied while inside
  // the cloud (entering while climbing marks the observed base; exiting, the
  // top). AMBIENT_IN_CLOUD is only a yes/no at the aircraft, so this is the
  // honest observable layer, not the sim's full cloud deck.
  let imcAnnotations = $derived.by(() => {
    if (!channels) return [];
    const bands: Array<{ type: 'range'; x: [Date, Date]; y: [number, number]; fill: string; layer: 'below' }> = [];
    let start: number | null = null;
    for (let i = 0; i <= channels.t.length; i++) {
      const inCloud = i < channels.t.length && channels.inCloud[i] === 1;
      if (inCloud && start === null) start = channels.t[i];
      if (!inCloud && start !== null) {
        const end = channels.t[Math.min(i, channels.t.length - 1)];
        const alts: number[] = [];
        for (let j = 0; j < channels.t.length; j++) {
          if (channels.t[j] >= start && channels.t[j] <= end) alts.push(altAt(channels.t[j]));
        }
        const pad = 150; // ft of visual thickness around the observed layer
        const low = Math.max(0, Math.min(...alts) - pad);
        const high = Math.max(...alts) + pad;
        bands.push({
          type: 'range',
          x: [new Date((details.departureTs + start) * 1000), new Date((details.departureTs + end) * 1000)],
          y: [low, high],
          fill: 'url(#imcDotPattern)',
          layer: 'below'
        });
        start = null;
      }
    }
    return bands;
  });

  let title = $derived(
    details?.originName && details?.destName ? `${details.originName} to ${details.destName}` : (details?.title ?? '')
  );

  const STAR_SLOTS = [0, 1, 2, 3, 4];

  // Hairline gauge ring; readouts clear the arc mouth at every size
  const GAUGE_RING = -4;

  // 5-star landing score from touchdown rate, on the flight-sim "butter"
  // scale. Imprecise by design.
  let landingStars = $derived.by(() => {
    if (details?.landingRateFpm == null) return null;
    const fpm = Math.abs(details.landingRateFpm);
    if (fpm <= 100) return 5;
    if (fpm <= 200) return 4;
    if (fpm <= 350) return 3;
    if (fpm <= 600) return 2;
    return 1;
  });

  function formatDuration(sec: number): string {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.round((sec % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  // Interpolated position + heading along the track at a time offset.
  function posAt(t: number): { lat: number; lon: number; bearing: number } | null {
    if (track.length < 2) return null;
    const clamped = Math.max(track[0][3], Math.min(track[track.length - 1][3], t));
    let i = 0;
    while (i < track.length - 2 && track[i + 1][3] < clamped) i++;
    const [lat0, lon0, , t0] = track[i];
    const [lat1, lon1, , t1] = track[i + 1];
    const f = t1 > t0 ? (clamped - t0) / (t1 - t0) : 0;
    const lat = lat0 + (lat1 - lat0) * f;
    const lon = lon0 + (lon1 - lon0) * f;
    const dLat = lat1 - lat0;
    const dLon = (lon1 - lon0) * Math.cos((lat * Math.PI) / 180);
    const bearing = (Math.atan2(dLon, dLat) * 180) / Math.PI;
    return { lat, lon, bearing: (bearing + 360) % 360 };
  }

  // Bridge between the chart and the map: the attachment fills this in once
  // the map has loaded, and the effects below push chart interactions into it.
  type MapApi = {
    setPlane: (t: number | null) => void;
    fitRange: (range: [number, number] | null) => void;
  };
  let mapApi = $state.raw<MapApi | null>(null);

  let groupState: ChartGroupState | undefined = $state();

  // Airframe limits for the gauges: redline RPM and Vne, matched from the
  // SimConnect aircraft title. Conservative defaults for anything else.
  let limits = $derived.by(() => {
    const t = (details?.aircraftTitle ?? '').toLowerCase();
    if (t.includes('comanche') || t.includes('pa-24') || t.includes('pa24')) {
      return { maxRpm: 2575, maxKt: 197, maxFuelGal: 60 };
    }
    if (t.includes('172')) return { maxRpm: 2700, maxKt: 163, maxFuelGal: 56 };
    return { maxRpm: 2700, maxKt: 180, maxFuelGal: 60 };
  });

  function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  // Gauge reading: the channel value at the scrubbed time, or a cruise
  // representative (median of positive samples) when idle. Null hides the
  // gauge (channel absent, or the simvar recorded all-zero).
  function gaugeReading(values: number[] | undefined): number | null {
    if (!channels || !values || values.length !== channels.t.length) return null;
    const positive = values.filter((v) => v > 0);
    if (positive.length === 0) return null;
    const pointer = groupState?.pointer;
    if (pointer?.active && pointer.x instanceof Date) {
      const t = pointer.x.getTime() / 1000 - details.departureTs;
      let best = 0;
      for (let i = 1; i < channels.t.length; i++) {
        if (Math.abs(channels.t[i] - t) < Math.abs(channels.t[best] - t)) best = i;
      }
      return values[best];
    }
    return median(positive);
  }
  let gaugeRpm = $derived(gaugeReading(channels?.rpm));
  let gaugeIas = $derived(gaugeReading(channels?.ias));

  // Fuel tank: scrubbed value, or what was left at landing when idle.
  let gaugeFuel = $derived.by(() => {
    const values = channels?.fuel;
    if (!channels || !values || values.length !== channels.t.length) return null;
    const positive = values.filter((v) => v > 0);
    if (positive.length === 0) return null;
    const pointer = groupState?.pointer;
    if (pointer?.active && pointer.x instanceof Date) {
      const t = pointer.x.getTime() / 1000 - details.departureTs;
      let best = 0;
      for (let i = 1; i < channels.t.length; i++) {
        if (Math.abs(channels.t[i] - t) < Math.abs(channels.t[best] - t)) best = i;
      }
      return values[best];
    }
    return positive[positive.length - 1];
  });

  let brushRange = $state.raw<[number, number] | null>(null);

  // Brushing either chart zooms both (shared xDomain) and fits the map.
  let zoomDomain = $derived(
    brushRange
      ? [new Date((details.departureTs + brushRange[0]) * 1000), new Date((details.departureTs + brushRange[1]) * 1000)]
      : undefined
  );

  let resettingBrush = false;

  function handleBrushEnd(detail: {
    brush: { active?: boolean; x: Array<number | Date | string | null>; reset: () => void };
  }) {
    if (resettingBrush) return;
    const [a, b] = detail.brush.x;
    if (
      detail.brush.active &&
      (a instanceof Date || typeof a === 'number') &&
      (b instanceof Date || typeof b === 'number')
    ) {
      // Chart x is wall-clock time; the map works in track offsets.
      const t0 = Number(a) / 1000 - details.departureTs;
      const t1 = Number(b) / 1000 - details.departureTs;
      brushRange = t1 > t0 ? [t0, t1] : null;
      // The zoom (xDomain) has consumed the selection; clear the rectangle.
      // Guarded in case reset() echoes another brush-end.
      resettingBrush = true;
      detail.brush.reset();
      setTimeout(() => {
        resettingBrush = false;
      }, 0);
    } else {
      brushRange = null;
    }
  }

  // Scrubbing either chart moves the plane along the track: the group's
  // shared pointer carries the hovered x-domain value (a Date).
  $effect(() => {
    const pointer = groupState?.pointer;
    if (!pointer?.active || !(pointer.x instanceof Date)) {
      mapApi?.setPlane(null);
      return;
    }
    mapApi?.setPlane(pointer.x.getTime() / 1000 - details.departureTs);
  });

  // A brush selection zooms the map to that segment; clearing it restores.
  $effect(() => {
    mapApi?.fitRange(brushRange);
  });

  // Build the MapLibre map inside an attachment so it only runs client-side.
  // The factory takes the theme so the attachment re-runs (and the map is
  // rebuilt with the matching basemap flavor) when the site theme flips.
  function flightMap(theme: 'light' | 'dark') {
    return (node: HTMLElement) => {
      let map: import('maplibre-gl').Map | undefined;
      let cancelled = false;

      (async () => {
        const [maplibregl, pmtiles, basemaps] = await Promise.all([
          import('maplibre-gl'),
          import('pmtiles'),
          import('@protomaps/basemaps')
        ]);
        if (cancelled) return;

        maplibregl.setWorkerUrl(maplibreWorkerUrl);

        // addProtocol is global; re-adding just replaces the handler.
        const protocol = new pmtiles.Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);

        // Mono flavors both ways: 'grayscale' (light) / 'black' (dark).
        const flavorName = theme === 'dark' ? 'black' : 'grayscale';
        const flavor = basemaps.namedFlavor(flavorName);
        const lineColor = theme === 'dark' ? '#f2f2f2' : '#1a1a1a';
        const haloColor = theme === 'dark' ? '#1a1a1a' : '#f2f2f2';

        const lons = track.map((p) => p[1]);
        const lats = track.map((p) => p[0]);
        const fullBounds: [[number, number], [number, number]] = [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)]
        ];

        const m = new maplibregl.Map({
          container: node,
          interactive: false,
          // OSM credit is rendered as a static line under the map instead
          attributionControl: false,
          bounds: fullBounds,
          // Short GA hops and pattern work fit at z11-12; cap there so a
          // tiny track still shows some surrounding context.
          fitBoundsOptions: { padding: 40, maxZoom: 12 },
          style: {
            version: 8,
            glyphs: `${BASEMAP_ASSETS}/fonts/{fontstack}/{range}.pbf`,
            sprite: `${BASEMAP_ASSETS}/sprites/v4/${flavorName}`,
            sources: {
              protomaps: {
                type: 'vector',
                url: `pmtiles://${TILES_URL}`,
                attribution: '© OpenStreetMap'
              }
            },
            layers: basemaps.layers('protomaps', flavor, { lang: 'en' })
          }
        });

        map = m;

        m.on('load', () => {
          m.addSource('flight-track', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: track.map((p) => [p[1], p[0]]) }
            }
          });
          m.addLayer({
            id: 'flight-track-line',
            type: 'line',
            source: 'flight-track',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': lineColor, 'line-width': 2 }
          });
          m.addSource('flight-endpoints', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [track[0], track[track.length - 1]].map((p) => ({
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: [p[1], p[0]] }
              }))
            }
          });
          m.addLayer({
            id: 'flight-endpoints-circles',
            type: 'circle',
            source: 'flight-endpoints',
            paint: {
              'circle-radius': 4,
              'circle-color': lineColor,
              'circle-stroke-color': haloColor,
              'circle-stroke-width': 2
            }
          });

          // Plane marker (hidden until the timeline is scrubbed)
          const iconSize = 64;
          const canvas = document.createElement('canvas');
          canvas.width = iconSize;
          canvas.height = iconSize;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const path = new Path2D(PLANE_PATH);
            ctx.scale(iconSize / 24, iconSize / 24);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = haloColor;
            ctx.lineJoin = 'round';
            ctx.stroke(path);
            ctx.fillStyle = lineColor;
            ctx.fill(path);
            m.addImage('flight-plane', ctx.getImageData(0, 0, iconSize, iconSize), { pixelRatio: 2 });
          }
          m.addSource('flight-plane-pos', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
          m.addLayer({
            id: 'flight-plane-symbol',
            type: 'symbol',
            source: 'flight-plane-pos',
            layout: {
              'icon-image': 'flight-plane',
              'icon-size': 0.75,
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true
            }
          });

          mapApi = {
            setPlane: (t) => {
              const src = m.getSource('flight-plane-pos') as import('maplibre-gl').GeoJSONSource | undefined;
              if (!src) return;
              const pos = t == null ? null : posAt(t);
              src.setData(
                pos == null
                  ? { type: 'FeatureCollection', features: [] }
                  : {
                      type: 'FeatureCollection',
                      features: [
                        {
                          type: 'Feature',
                          properties: { bearing: pos.bearing },
                          geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] }
                        }
                      ]
                    }
              );
            },
            fitRange: (range) => {
              if (range == null) {
                m.fitBounds(fullBounds, { padding: 40, maxZoom: 12, duration: 500 });
                return;
              }
              const pts = track.filter((p) => p[3] >= range[0] && p[3] <= range[1]);
              for (const t of range) {
                const pos = posAt(t);
                if (pos) pts.push([pos.lat, pos.lon, 0, t]);
              }
              if (pts.length < 2) return;
              const segLons = pts.map((p) => p[1]);
              const segLats = pts.map((p) => p[0]);
              m.fitBounds(
                [
                  [Math.min(...segLons), Math.min(...segLats)],
                  [Math.max(...segLons), Math.max(...segLats)]
                ],
                { padding: 40, maxZoom: 12, duration: 500 }
              );
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

<ActivityItem type="flight" {timestamp} {isPrivate} {isAdmin} {onHide}>
  {#if details}
    <div class="flightCard">
      <!-- Shared defs for the IMC cloud-layer dot fill (document-wide id;
           identical across cards, so collisions are harmless) -->
      <svg class="flightCard__defs" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="imcDotPattern" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" class="flightCard__imcDot" />
            <circle cx="5" cy="5" r="1" class="flightCard__imcDot" />
          </pattern>
        </defs>
      </svg>
      <div class="flightCard__title">{title}</div>
      <div class="flightCard__stats">
        {#if details.aircraftTitle}
          <div class="flightCard__statRow flightCard__statRow--wide">
            <span class="flightCard__statLabel">Aircraft</span>
            <span class="flightCard__statValue">{details.aircraftTitle}</span>
          </div>
        {/if}
        <div class="flightCard__statRow">
          <span class="flightCard__statLabel">Route</span>
          <span class="flightCard__statValue">{details.originIcao} → {details.destIcao}</span>
        </div>
        <div class="flightCard__statRow">
          <span class="flightCard__statLabel">Duration</span>
          <span class="flightCard__statValue">{formatDuration(details.durationSec)}</span>
        </div>
        {#if details.distanceNm != null}
          <div class="flightCard__statRow">
            <span class="flightCard__statLabel">Distance</span>
            <span class="flightCard__statValue">{details.distanceNm.toLocaleString()} nm</span>
          </div>
        {/if}
        {#if details.maxAltitudeFt != null}
          <div class="flightCard__statRow">
            <span class="flightCard__statLabel">Max altitude</span>
            <span class="flightCard__statValue">{details.maxAltitudeFt.toLocaleString()} ft</span>
          </div>
        {/if}
        {#if details.fuelBurnedGal != null && details.fuelBurnedGal > 0}
          <div class="flightCard__statRow">
            <span class="flightCard__statLabel">Fuel burned</span>
            <span class="flightCard__statValue">{details.fuelBurnedGal} gal</span>
          </div>
        {/if}
        {#if details.maxG != null}
          <div class="flightCard__statRow">
            <span class="flightCard__statLabel">Max G</span>
            <span class="flightCard__statValue">{details.maxG}G</span>
          </div>
        {/if}
        {#if details.avgHeadwindKt != null && details.avgHeadwindKt !== 0}
          <div class="flightCard__statRow">
            <span class="flightCard__statLabel">Wind</span>
            <span class="flightCard__statValue">
              {Math.abs(details.avgHeadwindKt)} kt {details.avgHeadwindKt > 0 ? 'headwind' : 'tailwind'}
            </span>
          </div>
        {/if}
        {#if details.landingRateFpm != null && landingStars != null}
          <div class="flightCard__statRow">
            <span class="flightCard__statLabel">Landing</span>
            <span class="flightCard__statValue">
              <span class="flightCard__stars" title="{details.landingRateFpm} fpm">
                {#each STAR_SLOTS as i (i)}<span
                    class="flightCard__star"
                    class:flightCard__star--empty={i >= landingStars}
                  >
                    ★
                  </span>{/each}
              </span>
              <span class="flightCard__statSub">{details.landingRateFpm} fpm</span>
            </span>
          </div>
        {/if}
      </div>
      {#if hasTrack}
        <div class="flightCard__viz">
          <div class="flightCard__chart">
            {#if gaugeRpm != null || gaugeIas != null}
              <div class="flightCard__gauges">
                {#if gaugeRpm != null}
                  <div class="flightCard__gaugeCell">
                    <div class="flightCard__gauge">
                      <ArcChart
                        data={[{ key: 'rpm', value: Math.min(gaugeRpm, limits.maxRpm) }]}
                        maxValue={limits.maxRpm}
                        range={[-120, 120]}
                        innerRadius={GAUGE_RING}
                        cornerRadius={0}
                        tooltipContext={false}
                        series={[{ key: 'rpm', value: (d: { value: number }) => d.value, color: 'var(--fg)' }]}
                        props={{ arc: { track: { fill: 'var(--visBg)' } } }}
                      />
                      <div class="flightCard__gaugeReadout">
                        <div class="flightCard__gaugeValue">{Math.round(gaugeRpm).toLocaleString()}</div>
                        <div class="flightCard__gaugeLabel">RPM</div>
                      </div>
                    </div>
                  </div>
                {/if}
                {#if gaugeIas != null}
                  <div class="flightCard__gaugeCell">
                    <div class="flightCard__gauge">
                      <ArcChart
                        data={[{ key: 'ias', value: Math.min(gaugeIas, limits.maxKt) }]}
                        maxValue={limits.maxKt}
                        range={[-120, 120]}
                        innerRadius={GAUGE_RING}
                        cornerRadius={0}
                        tooltipContext={false}
                        series={[{ key: 'ias', value: (d: { value: number }) => d.value, color: 'var(--fg)' }]}
                        props={{ arc: { track: { fill: 'var(--visBg)' } } }}
                      />
                      <div class="flightCard__gaugeReadout">
                        <div class="flightCard__gaugeValue">{Math.round(gaugeIas)}</div>
                        <div class="flightCard__gaugeLabel">IAS</div>
                      </div>
                    </div>
                  </div>
                {/if}
                {#if gaugeFuel != null}
                  <div class="flightCard__gaugeCell">
                    <div class="flightCard__gauge">
                      <ArcChart
                        data={[{ key: 'fuel', value: Math.min(gaugeFuel, limits.maxFuelGal) }]}
                        maxValue={limits.maxFuelGal}
                        range={[-120, 120]}
                        innerRadius={GAUGE_RING}
                        cornerRadius={0}
                        tooltipContext={false}
                        series={[{ key: 'fuel', value: (d: { value: number }) => d.value, color: 'var(--fg)' }]}
                        props={{ arc: { track: { fill: 'var(--visBg)' } } }}
                      />
                      <div class="flightCard__gaugeReadout">
                        <div class="flightCard__gaugeValue">{gaugeFuel.toFixed(1)}</div>
                        <div class="flightCard__gaugeLabel">GAL</div>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
            <ChartGroup
              bind:state={groupState}
              pointer={{ tooltip: false }}
              brush={false}
              domain={false}
              series={false}
            >
              <div class="flightCard__elevation">
                {#snippet planePoint({
                  points
                }: {
                  points: Array<{ x: number; y: number; fill: string; data: unknown }>;
                })}
                  {#each points as pt (pt.x)}
                    <path
                      class="flightCard__scrubPlane"
                      d={PLANE_SIDE_PATH}
                      transform="translate({pt.x}, {pt.y}) scale(0.055) translate(-260, -256)"
                    />
                  {/each}
                {/snippet}
                <AreaChart
                  data={chartData}
                  axis={false}
                  padding={{ top: 12, right: 0, bottom: 12, left: 0 }}
                  x="time"
                  y="alt"
                  yDomain={[0, yCeil]}
                  xDomain={zoomDomain}
                  annotations={imcAnnotations}
                  grid={false}
                  rule={false}
                  legend={false}
                  highlight={{ lines: true, points: planePoint }}
                  brush={{ zoomOnBrush: false, onBrushEnd: handleBrushEnd }}
                  series={[{ key: 'alt', label: 'Altitude', value: (d: ChartPoint) => d.alt, color: 'var(--fg)' }]}
                  props={{
                    area: { opacity: 0 },
                    tooltip: {
                      // Keep the tooltip inside the card (it portals to <body> by
                      // default) so it inherits the mono font.
                      root: { portal: false, xOffset: 20, yOffset: 20 },
                      header: { format: (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) },
                      item: { format: (v: number) => `${Math.round(v).toLocaleString()} ft` }
                    }
                  }}
                />
              </div>
            </ChartGroup>
          </div>
          <div class="flightCard__map" {@attach flightMap(mode.current === 'dark' ? 'dark' : 'light')}></div>
        </div>
        <div class="flightCard__attribution">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            © OpenStreetMap
          </a>
        </div>
      {/if}
      {#if details.routeString}
        <div class="flightCard__route">{details.routeString}</div>
      {/if}
    </div>
  {/if}
</ActivityItem>

<style>
  .flightCard {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .flightCard__title {
    font-weight: 600;
    line-height: 1.4;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .flightCard__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 2rem;
    font-size: 0.8125rem;
  }

  .flightCard__statRow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--visBg);
  }

  .flightCard__statRow--wide {
    grid-column: 1 / -1;
  }

  .flightCard__statLabel {
    color: var(--subtle);
  }

  .flightCard__statValue {
    font-family: var(--codeFont);
    text-align: right;
  }

  .flightCard__stars {
    letter-spacing: 0.1em;
  }

  .flightCard__star--empty {
    color: var(--visBg);
  }

  .flightCard__statSub {
    color: var(--subtle);
    font-size: 0.6875rem;
    margin-left: 0.375rem;
  }

  @media (max-width: 768px) {
    .flightCard__stats {
      grid-template-columns: 1fr;
    }
  }

  .flightCard__viz {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--visBg);
  }

  .flightCard__chart {
    padding: 0.5rem;
  }

  .flightCard__map {
    width: 100%;
    height: 16rem;
    overflow: hidden;
    background: var(--subtle);
  }

  .flightCard__elevation {
    font-size: 0.6875rem;
    /* Cascades into the SVG axis labels, legend, and the tooltip */
    font-family: var(--codeFont);
  }

  .flightCard__elevation {
    height: 9rem;
  }

  .flightCard__gauges {
    display: flex;
    justify-content: center;
    gap: 2.5rem;
    padding: 0.25rem 0 0.5rem;
    font-family: var(--codeFont);
  }

  .flightCard__gauge {
    position: relative;
    width: 9.5rem;
    height: 5.25rem;
  }

  .flightCard__gaugeReadout {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 1.2rem;
    gap: 0.15rem;
    pointer-events: none;
    font-family: var(--codeFont);
  }

  .flightCard__gaugeValue {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .flightCard__gaugeLabel {
    color: var(--subtle);
    font-size: 0.5625rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* LayerChart internals: CSS outranks its presentation attributes */
  .flightCard__elevation :global(.lc-area-line) {
    stroke-width: 2.5px;
  }

  .flightCard__elevation :global(.lc-axis-tick-label) {
    fill: var(--subtle);
  }

  .flightCard__elevation :global(.lc-tooltip-header) {
    border-bottom: none;
    padding-bottom: 0;
  }

  .flightCard__elevation :global(.flightCard__scrubPlane) {
    fill: var(--fg);
    /* Halo separates the glyph from the altitude line and crosshair.
       Width is in the glyph's 512-unit space (scaled ~0.055 -> ~3.5px visual) */
    stroke: var(--bg);
    stroke-width: 64px;
    paint-order: stroke;
  }

  .flightCard__defs {
    position: absolute;
    width: 0;
    height: 0;
  }

  .flightCard__imcDot {
    fill: var(--fg);
    opacity: 0.35;
  }

  .flightCard__attribution {
    text-align: right;
    font-family: var(--codeFont);
    font-size: 0.625rem;
    margin-top: -0.25rem;
  }

  .flightCard__attribution a {
    color: var(--subtle);
    text-decoration: none;
  }

  .flightCard__attribution a:hover {
    text-decoration: underline;
  }

  .flightCard__route {
    color: var(--subtle);
    font-size: 0.75rem;
    font-family: var(--codeFont);
    overflow-wrap: anywhere;
  }

  @media (max-width: 768px) {
    .flightCard__map {
      height: 12rem;
    }

    .flightCard__gauges {
      gap: 0.5rem;
      justify-content: space-between;
    }

    .flightCard__gauge {
      width: 5.75rem;
      height: 3.4rem;
    }

    .flightCard__gaugeReadout {
      padding-top: 1.05rem;
      gap: 0.05rem;
    }

    .flightCard__gaugeValue {
      font-size: 0.6875rem;
    }

    .flightCard__gaugeLabel {
      font-size: 0.5rem;
    }

    .flightCard__elevation {
      height: 7rem;
    }
  }
</style>
