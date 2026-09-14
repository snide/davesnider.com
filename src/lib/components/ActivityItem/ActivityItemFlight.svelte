<script lang="ts">
  import type {
    FlightChannels,
    FlightFuelPhases,
    FlightPause,
    FlightPhoto,
    FlightTrackPoint,
    SelectActivityFlight
  } from '$db/schema';
  import { ArcChart, AreaChart, ChartGroup, Tooltip, type ChartGroupState } from 'layerchart';
  import { tick } from 'svelte';
  import { cfImage, cfImageSrcset } from '$lib/utils/image';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { basemapStyle, loadMapLibs, mapPalette } from '$lib/map';
  import { mode } from 'mode-watcher';
  import ActivityItem from './ActivityItem.svelte';

  interface Props {
    details: SelectActivityFlight;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
    // Rendered outside the feed (a trip post): no feed chrome, title or
    // trip chips — the card starts at the screenshot.
    embedded?: boolean;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide, embedded = false }: Props = $props();

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

  // 40% headroom: room for the pause label and photo popovers above the
  // cruise plateau (the domain is exact now that yNice is off)
  let yCeil = $derived(Math.max(...track.map((p) => p[2]), 1) * 1.4);

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

  // Dashed markers where sim pauses were excised from the time base. Every
  // gap is excised and recorded, but sub-minute blips (loading stutters,
  // quick menu peeks) don't earn a marker — they'd label as "Pause 0m".
  let pauseAnnotations = $derived(
    ((details?.pauses ?? []) as FlightPause[])
      .filter((p) => p.sec >= 60)
      .map((p) => ({
        type: 'line' as const,
        x: new Date((details.departureTs + p.t) * 1000),
        label: `Pause\n${formatDuration(p.sec)}`,
        labelXOffset: 8,
        props: {
          line: { class: 'flightCard__pauseLine' },
          label: { fill: 'var(--subtle)' }
        }
      }))
  );

  function formatElapsed(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  let title = $derived(
    details?.originName && details?.destName ? `${details.originName} to ${details.destName}` : (details?.title ?? '')
  );

  const STAR_SLOTS = [0, 1, 2, 3, 4];

  // Hairline gauge ring; readouts clear the arc mouth at every size
  const GAUGE_RING = -4;

  // 5-star landing score from the hardest touchdown, on the flight-sim
  // "butter" scale, less one star per bounce (floor of one). Imprecise by
  // design.
  let landingStars = $derived.by(() => {
    if (details?.landingRateFpm == null) return null;
    const fpm = Math.abs(details.landingRateFpm);
    const base = fpm <= 100 ? 5 : fpm <= 200 ? 4 : fpm <= 350 ? 3 : fpm <= 600 ? 2 : 1;
    return Math.max(1, base - (details.bounces ?? 0));
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

  // Airframe profile, matched from the SimConnect aircraft title: gauge
  // limits (redline RPM, Vne, usable fuel) and, where known, the POH cruise
  // figures the fuel stats are compared against. Piston book numbers are
  // the real airplane's 65% power cruise — the A2A model may differ; adjust
  // here. Conservative gauge defaults and no book figure for anything else.
  type AirframeProfile = {
    maxRpm: number;
    maxKt: number;
    maxFuelGal: number;
    // Turboprops: the recorder's GENERAL ENG RPM is the power-turbine shaft
    // speed ahead of the reduction gearbox (a PT6A reads 33,000 at 2,200
    // prop rpm and ~20,000 at ground idle); divide by the gearbox ratio to
    // show prop RPM. Absent = the channel already is crankshaft RPM.
    propGearRatio?: number;
    book?: { cruiseGph: number; cruiseKtas: number; setting: string };
  };
  let limits = $derived.by((): AirframeProfile => {
    const t = (details?.aircraftTitle ?? '').toLowerCase();
    if (t.includes('comanche') || t.includes('pa-24') || t.includes('pa24')) {
      return {
        maxRpm: 2575,
        maxKt: 197,
        maxFuelGal: 60,
        book: { cruiseGph: 12.5, cruiseKtas: 150, setting: '65% power cruise' }
      };
    }
    if (t.includes('172')) {
      return {
        maxRpm: 2700,
        maxKt: 163,
        maxFuelGal: 56,
        book: { cruiseGph: 8.6, cruiseKtas: 115, setting: '65% power cruise' }
      };
    }
    if (t.includes('turbine duke') || t.includes('b60t')) {
      // Black Square Turbine Duke (2× PT6A-35). Manual limits: prop redline
      // 2,190 (the sim governs at 2,200 through the 15:1 box), Vne 198 KIAS,
      // 265.9 gal usable Jet A. Book = the manual's normal-cruise table at
      // FL200: 45 gph per engine, 264 KTAS — its own tables, not a real POH.
      return {
        maxRpm: 2200,
        maxKt: 198,
        maxFuelGal: 266,
        propGearRatio: 15,
        book: { cruiseGph: 90, cruiseKtas: 264, setting: 'normal cruise, FL200' }
      };
    }
    return { maxRpm: 2700, maxKt: 180, maxFuelGal: 60 };
  });

  // Book still-air economy for the "Economy" comparison
  let bookNmPerGal = $derived(limits.book ? limits.book.cruiseKtas / limits.book.cruiseGph : null);

  // Fuel stats for flights recorded before the recorder computed them:
  // derived from the stored fuel channel and the track. Burn rate and
  // economy are exact (first/last airborne quantity over flight time); the
  // phase split is approximate — VS comes from the track and fuel is
  // bucketed at channel resolution (up to ~70 s on a long flight) — but it
  // is the same method the recorder uses at 1 Hz. Wind cost needs TAS,
  // which the channels don't carry, so it stays absent for old flights.
  let derivedFuel = $derived.by(() => {
    const fuel = channels?.fuel;
    if (!channels || !fuel || fuel.length !== channels.t.length || track.length < 2) return null;
    const dur = details.durationSec;
    const airborne = channels.t
      .map((t, i) => i)
      .filter((i) => channels.t[i] >= 0 && channels.t[i] <= dur && fuel[i] > 0);
    if (airborne.length < 2 || dur <= 0) return null;
    const flown = fuel[airborne[0]] - fuel[airborne[airborne.length - 1]];
    if (!(flown > 0)) return null;
    const avgGph = flown / (dur / 3600);
    const nmPerGal = details.distanceNm != null ? details.distanceNm / flown : null;

    const phases: FlightFuelPhases = {
      taxi: { sec: 0, gal: 0, nm: 0 },
      climb: { sec: 0, gal: 0, nm: 0 },
      cruise: { sec: 0, gal: 0, nm: 0 },
      descent: { sec: 0, gal: 0, nm: 0 }
    };
    for (let i = 1; i < channels.t.length; i++) {
      const t0 = channels.t[i - 1];
      const t1 = channels.t[i];
      const dt = t1 - t0;
      if (dt <= 0) continue;
      const onGround = t1 < 0 || t0 > dur;
      const vs = ((altAt(t1) - altAt(t0)) / dt) * 60;
      const key = onGround ? 'taxi' : vs > 300 ? 'climb' : vs < -300 ? 'descent' : 'cruise';
      phases[key].sec += dt;
      phases[key].nm += (channels.gs[i] * dt) / 3600;
      if (fuel[i - 1] > 0 && fuel[i] > 0) phases[key].gal += Math.max(0, fuel[i - 1] - fuel[i]);
    }
    for (const phase of Object.values(phases)) {
      phase.sec = Math.round(phase.sec);
      phase.gal = Math.round(phase.gal * 10) / 10;
      phase.nm = Math.round(phase.nm * 10) / 10;
    }
    return {
      avgGph: Math.round(avgGph * 10) / 10,
      nmPerGal: nmPerGal != null ? Math.round(nmPerGal * 10) / 10 : null,
      phases
    };
  });

  // Recorder-computed values win; the derived ones fill in for old rows.
  let avgFuelFlowGph = $derived(details?.avgFuelFlowGph ?? derivedFuel?.avgGph ?? null);
  let nmPerGal = $derived(details?.nmPerGal ?? derivedFuel?.nmPerGal ?? null);
  let fuelPhases = $derived(
    (details?.fuelPhases as FlightFuelPhases | null | undefined) ?? derivedFuel?.phases ?? null
  );

  // Fuel left at touchdown (last positive quantity sample) as endurance at
  // this flight's average burn — the reserve you landed with.
  let reserve = $derived.by(() => {
    const values = channels?.fuel;
    const gph = avgFuelFlowGph;
    if (!channels || !values || values.length !== channels.t.length || !gph) return null;
    const positive = values.filter((v) => v > 0);
    if (positive.length === 0) return null;
    const gal = positive[positive.length - 1];
    return { gal, sec: (gal / gph) * 3600 };
  });

  // One stat row per airborne phase; taxi fuel is in the total but too
  // small to earn a row. Phases with no burn are dropped.
  const FUEL_PHASE_ORDER: Array<{ key: keyof FlightFuelPhases; label: string }> = [
    { key: 'climb', label: 'Climb' },
    { key: 'cruise', label: 'Cruise' },
    { key: 'descent', label: 'Descent' }
  ];
  const PHASE_GLYPH: Record<keyof FlightFuelPhases, string> = { taxi: '·', climb: '↗', cruise: '→', descent: '↘' };
  let fuelPhaseSegments = $derived.by(() => {
    const phases = fuelPhases;
    if (!phases) return [];
    return FUEL_PHASE_ORDER.filter(({ key }) => phases[key] && phases[key].gal > 0).map(({ key, label }) => {
      const { gal, sec } = phases[key];
      return { key, label, glyph: PHASE_GLYPH[key], gal, sec, gph: sec > 0 ? (gal / sec) * 3600 : 0 };
    });
  });

  // Phase intervals for the strip under the altitude chart, classified
  // from the track's slope between channel samples with the recorder's
  // ±300 fpm rule. Runs shorter than PHASE_MIN_SEC are absorbed into the
  // run before them so a bumpy cruise doesn't shred into slivers. Only the
  // airborne part of the flight is classified.
  const PHASE_MIN_SEC = 90;
  type PhaseInterval = { key: 'climb' | 'cruise' | 'descent'; t0: number; t1: number };
  let phaseIntervals = $derived.by(() => {
    if (!channels || track.length < 2) return [] as PhaseInterval[];
    const dur = details.durationSec;
    const times = channels.t.filter((t) => t >= 0 && t <= dur);
    if (times[0] !== 0) times.unshift(0);
    if (times[times.length - 1] !== dur) times.push(dur);
    const runs: PhaseInterval[] = [];
    for (let i = 1; i < times.length; i++) {
      const t0 = times[i - 1];
      const t1 = times[i];
      if (t1 <= t0) continue;
      const vs = ((altAt(t1) - altAt(t0)) / (t1 - t0)) * 60;
      const key: PhaseInterval['key'] = vs > 300 ? 'climb' : vs < -300 ? 'descent' : 'cruise';
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.t1 = t1;
      else runs.push({ key, t0, t1 });
    }
    const merged: PhaseInterval[] = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (last && (run.t1 - run.t0 < PHASE_MIN_SEC || last.key === run.key)) last.t1 = run.t1;
      else merged.push({ ...run });
    }
    return merged;
  });

  // Strip segments as percentages of the visible domain (brush-zoom aware,
  // like the pins), clipped to it.
  let phaseStrip = $derived.by(() => {
    if (phaseIntervals.length === 0 || track.length < 2) return [];
    const d0 = brushRange ? brushRange[0] : track[0][3];
    const d1 = brushRange ? brushRange[1] : track[track.length - 1][3];
    if (d1 <= d0) return [];
    return phaseIntervals
      .map((p) => ({ ...p, t0: Math.max(p.t0, d0), t1: Math.min(p.t1, d1) }))
      .filter((p) => p.t1 > p.t0)
      .map((p) => ({
        key: p.key,
        left: ((p.t0 - d0) / (d1 - d0)) * 100,
        width: ((p.t1 - p.t0) / (d1 - d0)) * 100,
        label: `${p.key[0].toUpperCase()}${p.key.slice(1)} ${formatDuration(p.t1 - p.t0)}`
      }));
  });

  // Conditions: time in cloud over the airborne part of the flight (from
  // the in-cloud channel, which is a yes/no at the aircraft), plus the
  // cruise OAT when the recording carries it. Under a minute in cloud is VMC.
  let conditions = $derived.by(() => {
    if (!channels || channels.inCloud.length !== channels.t.length) return null;
    const dur = details.durationSec;
    let imcSec = 0;
    for (let i = 1; i < channels.t.length; i++) {
      const t0 = Math.max(0, channels.t[i - 1]);
      const t1 = Math.min(dur, channels.t[i]);
      if (t1 > t0 && channels.inCloud[i] === 1) imcSec += t1 - t0;
    }
    const oat = channels.oat;
    let oatC: number | null = null;
    if (oat && oat.length === channels.t.length) {
      const airborne = oat.filter((_, i) => channels.t[i] >= 0 && channels.t[i] <= dur);
      if (airborne.length > 0) oatC = median(airborne);
    }
    const imc = imcSec >= 60;
    return {
      label: imc ? `IMC ${formatDuration(imcSec)}` : 'VMC',
      sub: [imc && dur > 0 ? `${Math.round((imcSec / dur) * 100)}% of flight` : null, oatC != null ? `${oatC}°C` : null]
        .filter(Boolean)
        .join(' · ')
    };
  });

  // "45m" / "1h 5m" for the wind-cost sub-label; sub-minute is noise
  let windCost = $derived.by(() => {
    const sec = details?.windCostSec;
    if (sec == null || Math.abs(sec) < 60) return null;
    return { label: sec > 0 ? 'cost' : 'saved', text: formatDuration(Math.abs(sec)) };
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
  let gaugeRpm = $derived.by(() => {
    const shaft = gaugeReading(channels?.rpm);
    return shaft == null ? null : shaft / (limits.propGearRatio ?? 1);
  });
  let gaugeIas = $derived(gaugeReading(channels?.ias));

  // Terrain silhouette under the altitude trace, from the ground channel.
  // Shaped as ChartPoint (alt = terrain elevation) so both series share the
  // chart's generic type; lat/lon are unused by the chart.
  let groundData = $derived.by(() => {
    const values = channels?.ground;
    if (!channels || !values || values.length !== channels.t.length) return [] as ChartPoint[];
    if (Math.max(...values) <= 0) return [] as ChartPoint[];
    return channels.t.map((t, i) => ({
      time: new Date((details.departureTs + t) * 1000),
      alt: values[i],
      t,
      lat: 0,
      lon: 0
    })) as ChartPoint[];
  });

  // Terrain elevation at a flight-time offset (nearest ground sample)
  function groundAt(t: number): number {
    if (groundData.length === 0) return 0;
    let best = 0;
    for (let i = 1; i < groundData.length; i++) {
      if (Math.abs(groundData[i].t - t) < Math.abs(groundData[best].t - t)) best = i;
    }
    return groundData[best].alt;
  }

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

  // Flight replay: sweep the group pointer (dials, chart glyph, crosshair)
  // and the map plane from departure to arrival. Speed: one real second per
  // flight minute, clamped to a feed-friendly 8-20s.
  let playing = $state(false);
  let playRaf = 0;

  function stopReplay() {
    playing = false;
    cancelAnimationFrame(playRaf);
    groupState?.clearPointer();
    mapApi?.setPlane(null);
  }

  function toggleReplay() {
    if (playing) {
      stopReplay();
      return;
    }
    if (!hasTrack) return;
    parked = false;
    playing = true;
    const tStart = track[0][3];
    const tEnd = track[track.length - 1][3];
    const durationMs = Math.min(20000, Math.max(8000, (details.durationSec / 60) * 1000));
    const start = performance.now();
    const step = (now: number) => {
      if (!playing) return;
      const f = (now - start) / durationMs;
      if (f >= 1) {
        stopReplay();
        return;
      }
      const t = tStart + f * (tEnd - tStart);
      groupState?.setPointer({ x: new Date((details.departureTs + t) * 1000) });
      mapApi?.setPlane(t);
      playRaf = requestAnimationFrame(step);
    };
    playRaf = requestAnimationFrame(step);
  }

  $effect(() => {
    return () => cancelAnimationFrame(playRaf);
  });

  // Photo-mode pins: projected to map screen space by the attachment; HTML
  // dots give free hover/click/focus without enabling map interactivity.
  let photos = $derived((details?.photos ?? []) as FlightPhoto[]);
  type PhotoPin = { x: number; y: number; url: string; t: number; index: number };
  let photoPins = $state.raw<PhotoPin[]>([]);
  let activePin = $state.raw<PhotoPin | null>(null);
  let activePinArea = $state.raw<'map' | 'chart'>('map');
  let pinTimer: ReturnType<typeof setTimeout> | undefined;

  // Hover previews are a 16:9 crop served by Cloudflare Image Resizing
  // (2x the 192px popover) — never the multi-megabyte original.
  const PREVIEW_W = 192;
  function previewSrc(url: string): string {
    return cfImage(url, { w: PREVIEW_W * 2, h: (PREVIEW_W * 2 * 9) / 16, fit: 'cover' });
  }

  // Carousel — always open, never autoplays. The admin screenshot (when
  // present) is slide one; the photo-mode shots follow in flight order.
  // Arrow keys step while it has focus.
  type Slide = { url: string; kind: 'screenshot' | 'photo'; t?: number };
  let slides = $derived.by(() => {
    const list: Slide[] = [];
    if (details?.screenshotUrl) list.push({ url: details.screenshotUrl, kind: 'screenshot' });
    for (const p of photos) list.push({ url: p.url, kind: 'photo', t: p.t });
    return list;
  });
  let photoOffset = $derived(details?.screenshotUrl ? 1 : 0);
  let slideIndex = $state(0);
  let carouselTouched = $state(false);
  let carouselEl = $state<HTMLDivElement | null>(null);
  const CAROUSEL_WIDTHS = [640, 1280, 1920];

  function slideSrc(slide: Slide): string {
    return slide.kind === 'screenshot'
      ? cfImage(slide.url, { w: 1280, h: 360, fit: 'cover' })
      : cfImage(slide.url, { w: 1280 });
  }

  function showSlide(index: number) {
    if (slides.length === 0) return;
    slideIndex = ((index % slides.length) + slides.length) % slides.length;
    carouselTouched = true;
    // A brush zoom would hide a photo outside its window; stepping the
    // carousel resets it (xDomain and the map fit follow brushRange).
    brushRange = null;
    parkPointer();
  }

  // A selected photo parks the group's shared pointer (chart glyph +
  // tooltip, gauges, and — via the pointer effect — the map plane) at its
  // flight time. Parking is one-shot: the moment the visitor hovers the
  // chart or the map the pointer is theirs again (chart hover scrubs, and
  // its leave clears as usual), and a click anywhere outside the chart,
  // map or carousel clears a parked pointer. Replay owns the pointer while
  // it runs and the screenshot slide parks nothing.
  let slideTime = $derived(slides[Math.min(slideIndex, Math.max(slides.length - 1, 0))]?.t ?? null);
  let parked = $state(false);
  let chartEl = $state<HTMLDivElement | null>(null);
  let mapWrapEl = $state<HTMLDivElement | null>(null);

  function parkPointer() {
    if (playing) return;
    if (slideTime == null) {
      groupState?.clearPointer();
      parked = false;
    } else {
      groupState?.setPointer({ x: new Date((details.departureTs + slideTime) * 1000) });
      parked = true;
    }
  }

  function releasePointer(clear = false) {
    if (!parked) return;
    parked = false;
    if (clear) groupState?.clearPointer();
  }

  function onWindowClick(event: MouseEvent) {
    if (!parked) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (chartEl?.contains(target) || mapWrapEl?.contains(target) || carouselEl?.contains(target)) return;
    releasePointer(true);
  }

  function stepSlide(delta: number) {
    showSlide(slideIndex + delta);
  }

  // Pins address photos, and the carousel sits above them — bring it back
  // into view when a pin far down the card picks a slide.
  function openPhoto(index: number) {
    showSlide(index + photoOffset);
    clearTimeout(pinTimer);
    activePin = null;
    tick().then(() => {
      carouselEl?.focus({ preventScroll: true });
      carouselEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function onCarouselKey(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepSlide(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepSlide(1);
    }
  }

  // Once the visitor starts stepping, warm the neighbours so the next
  // step never waits on the network (not on load — a feed of cards would
  // otherwise pull two extra images each).
  $effect(() => {
    if (!carouselTouched || slides.length < 2) return;
    for (const delta of [-1, 1]) {
      const img = new Image();
      img.src = slideSrc(slides[(slideIndex + delta + slides.length) % slides.length]);
    }
  });

  function enterPin(pin: PhotoPin, area: 'map' | 'chart' = 'map') {
    clearTimeout(pinTimer);
    activePin = pin;
    activePinArea = area;
  }

  function leavePin() {
    clearTimeout(pinTimer);
    pinTimer = setTimeout(() => (activePin = null), 250);
  }

  // Hit targets over the elevation-chart ticks, using the same projection
  // the chart does (0 horizontal padding, 12px vertical, yDomain [0, yCeil]),
  // and respecting the current brush zoom.
  let elevW = $state(0);
  let elevH = $state(0);
  let chartPhotoPins = $derived.by(() => {
    if (!elevW || !elevH || photos.length === 0 || track.length < 2) return [] as PhotoPin[];
    const t0 = brushRange ? brushRange[0] : track[0][3];
    const t1 = brushRange ? brushRange[1] : track[track.length - 1][3];
    if (t1 <= t0) return [] as PhotoPin[];
    return photos
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => p.t >= t0 && p.t <= t1)
      .map(({ p, index }) => ({
        x: ((p.t - t0) / (t1 - t0)) * elevW,
        y: 12 + (1 - altAt(p.t) / yCeil) * (elevH - 24),
        url: p.url,
        t: p.t,
        index
      }));
  });

  // Wind at a flight-time offset: the nearest channel sample, with the
  // headwind component taken against the track's true course (wind
  // direction is degrees true; the track bearing is true too).
  // headwind > 0 is on the nose; crosswind > 0 is from the right.
  type WindReading = { kt: number; dir: number; headwind: number; crosswind: number };
  function windAt(t: number): WindReading | null {
    if (!channels || channels.windKt.length !== channels.t.length) return null;
    let best = 0;
    for (let i = 1; i < channels.t.length; i++) {
      if (Math.abs(channels.t[i] - t) < Math.abs(channels.t[best] - t)) best = i;
    }
    const kt = channels.windKt[best];
    if (!(kt > 0)) return null;
    const dir = channels.windDir[best];
    const angle = ((dir - (posAt(t)?.bearing ?? 0)) * Math.PI) / 180;
    return { kt, dir, headwind: kt * Math.cos(angle), crosswind: kt * Math.sin(angle) };
  }

  // Tooltip rows for a wind reading: the raw wind, then its components
  // against the track. A component under half a knot isn't listed.
  function windRows(w: WindReading): Array<{ label: string; value: string }> {
    const rows = [
      { label: 'Wind', value: `${Math.round(w.kt)} kt from ${String(Math.round(w.dir)).padStart(3, '0')}°` }
    ];
    const head = Math.round(Math.abs(w.headwind));
    if (head > 0) rows.push({ label: w.headwind > 0 ? 'Headwind' : 'Tailwind', value: `${head} kt` });
    const cross = Math.round(Math.abs(w.crosswind));
    if (cross > 0)
      rows.push({ label: 'Crosswind', value: `${cross} kt from the ${w.crosswind > 0 ? 'right' : 'left'}` });
    return rows;
  }

  // Wind arrows in the headroom above the altitude trace: one every
  // WIND_ARROW_GAP px of visible chart, showing only the along-track
  // component — pointing left against the timeline is a headwind, right is
  // a tailwind, length by that component; a dot marks a pure crosswind or
  // calm. Same projection as the photo pins, so they track the brush zoom.
  const WIND_ARROW_GAP = 30;
  const WIND_ARROW_Y = 14;
  const WIND_ARROW_MIN_KT = 2;
  type WindArrow = { t: number; x: number; headwind: boolean; len: number; label: string };
  let windArrows = $derived.by(() => {
    if (!elevW || !channels || track.length < 2 || channels.windKt.length !== channels.t.length) {
      return [] as WindArrow[];
    }
    const t0 = brushRange ? brushRange[0] : track[0][3];
    const t1 = brushRange ? brushRange[1] : track[track.length - 1][3];
    if (t1 <= t0) return [] as WindArrow[];
    const visible = channels.t.map((t, i) => i).filter((i) => channels.t[i] >= t0 && channels.t[i] <= t1);
    const stride = Math.max(1, Math.ceil(visible.length / Math.floor(elevW / WIND_ARROW_GAP)));
    const arrows: WindArrow[] = [];
    for (let k = 0; k < visible.length; k += stride) {
      const t = channels.t[visible[k]];
      const w = windAt(t);
      if (!w) continue;
      const along = Math.abs(w.headwind);
      arrows.push({
        t,
        x: ((t - t0) / (t1 - t0)) * elevW,
        headwind: w.headwind > 0,
        len: along < WIND_ARROW_MIN_KT ? 0 : Math.min(24, 6 + along * 0.5),
        label: windRows(w)
          .map((r) => `${r.label} ${r.value}`)
          .join(', ')
      });
    }
    return arrows;
  });

  function arrowPath(len: number): string {
    const half = len / 2;
    return `M ${-half} 0 H ${half} M ${half - 3.5} -3 L ${half} 0 L ${half - 3.5} 3`;
  }

  // Camera ticks on the elevation trace at each photo's flight time
  let photoAnnotations = $derived(
    photos.map((p) => ({
      type: 'point' as const,
      x: new Date((details.departureTs + p.t) * 1000),
      y: altAt(p.t),
      r: 3.5,
      props: { circle: { class: 'flightCard__photoTick' } }
    }))
  );

  // Admin screenshot upload: single 21:9 hero stored on R2 via the
  // cookie-authed endpoint. `details` is a deep-reactive page state proxy,
  // so mutating screenshotUrl re-renders (same pattern as Plex reviews).
  let uploadingScreenshot = $state(false);

  async function onScreenshotPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || uploadingScreenshot) return;
    uploadingScreenshot = true;
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/activity/flight/${details.activityId}/screenshot`, { method: 'POST', body });
      if (res.ok) {
        const data = await res.json();
        details.screenshotUrl = data.url;
      }
    } finally {
      uploadingScreenshot = false;
      input.value = '';
    }
  }

  // Admin trip tagging: marks this flight as a leg of a challenge trip (slug)
  // and optionally names the goal its arrival reached. Admin-only in both
  // directions — the chips are data entry, not something visitors see; the
  // trip post is the public face. Same details-mutation pattern as the
  // screenshot upload.
  let editingTrip = $state(false);
  let tripDraft = $state('');
  let tripStopDraft = $state('');
  let savingTrip = $state(false);
  let tripError = $state<string | null>(null);

  function openTripEditor() {
    tripDraft = details.trip ?? '';
    tripStopDraft = details.tripStop ?? '';
    tripError = null;
    editingTrip = true;
  }

  async function patchTrip(body: { trip: string | null; tripStop: string | null }) {
    if (savingTrip) return;
    savingTrip = true;
    tripError = null;
    try {
      const res = await fetch(`/api/activity/flight/${details.activityId}/trip`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        tripError = data.error ?? 'Save failed';
        return;
      }
      details.trip = data.trip;
      details.tripStop = data.tripStop;
      editingTrip = false;
    } catch {
      tripError = 'Save failed';
    } finally {
      savingTrip = false;
    }
  }

  function saveTrip(event: SubmitEvent) {
    event.preventDefault();
    patchTrip({ trip: tripDraft, tripStop: tripStopDraft });
  }

  function clearTrip() {
    patchTrip({ trip: null, tripStop: null });
  }

  // Build the MapLibre map inside an attachment so it only runs client-side.
  // The factory takes the theme so the attachment re-runs (and the map is
  // rebuilt with the matching basemap flavor) when the site theme flips.
  function flightMap(theme: 'light' | 'dark') {
    return (node: HTMLElement) => {
      let map: import('maplibre-gl').Map | undefined;
      let cancelled = false;

      (async () => {
        // Worker URL, pmtiles protocol, style and palette live in $lib/map
        const { maplibregl, basemaps } = await loadMapLibs();
        if (cancelled) return;

        const { lineColor, haloColor } = mapPalette(theme);

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
          style: basemapStyle(basemaps, theme)
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

          // Photo pins: keep screen positions in sync with the camera
          // Pins are HTML outside the canvas, so a zoomed map (brush fit)
          // would otherwise leave off-screen photos floating over the page.
          const updatePhotoPins = () => {
            const { clientWidth: w, clientHeight: h } = m.getContainer();
            photoPins = photos.flatMap((p, index) => {
              const pt = m.project([p.lon, p.lat]);
              if (pt.x < 0 || pt.y < 0 || pt.x > w || pt.y > h) return [];
              return [{ x: pt.x, y: pt.y, url: p.url, t: p.t, index }];
            });
          };
          updatePhotoPins();
          m.on('move', updatePhotoPins);

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
        photoPins = [];
        activePin = null;
        map?.remove();
      };
    };
  }
</script>

{#snippet card()}
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
      {#if !embedded}
        <div class="flightCard__title">{title}</div>
      {/if}
      {#if !embedded && isAdmin}
        <div class="flightCard__trip">
          {#if editingTrip}
            <form class="flightCard__tripForm" onsubmit={saveTrip}>
              <input
                class="flightCard__tripInput"
                type="text"
                placeholder="trip slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxlength="64"
                bind:value={tripDraft}
              />
              <input
                class="flightCard__tripInput flightCard__tripInput--stop"
                type="text"
                placeholder="stop reached (optional; A / B for two)"
                maxlength="120"
                bind:value={tripStopDraft}
              />
              <button class="flightCard__tripButton" type="submit" disabled={savingTrip}>
                {savingTrip ? 'saving…' : 'save'}
              </button>
              <button class="flightCard__tripButton" type="button" onclick={() => (editingTrip = false)}>cancel</button>
              {#if details.trip}
                <button class="flightCard__tripButton flightCard__tripButton--clear" type="button" onclick={clearTrip}>
                  clear
                </button>
              {/if}
              {#if tripError}
                <span class="flightCard__tripError">{tripError}</span>
              {/if}
            </form>
          {:else if details.trip}
            <span class="flightCard__tripChip">{details.trip}</span>
            {#if details.tripStop}
              <span class="flightCard__tripChip flightCard__tripChip--stop">{details.tripStop}</span>
            {/if}
            {#if isAdmin}
              <button class="flightCard__tripEdit" type="button" onclick={openTripEditor}>edit</button>
            {/if}
          {:else}
            <button class="flightCard__tripAdd" type="button" onclick={openTripEditor}>+ tag trip</button>
          {/if}
        </div>
      {/if}
      {#if slides.length > 0}
        {@const slide = slides[Math.min(slideIndex, slides.length - 1)]}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="flightCard__carousel"
          role="group"
          aria-roledescription="carousel"
          aria-label="Screenshot and photos from the flight"
          tabindex="-1"
          bind:this={carouselEl}
          onkeydown={onCarouselKey}
        >
          <div class="flightCard__carouselStage">
            {#key slide.url}
              <a class="flightCard__carouselLink" href={slide.url} target="_blank" rel="noopener noreferrer">
                {#if slide.kind === 'screenshot'}
                  <img
                    class="flightCard__carouselImg flightCard__carouselImg--hero"
                    src={slideSrc(slide)}
                    srcset={cfImageSrcset(slide.url, CAROUSEL_WIDTHS, { aspect: 32 / 9, fit: 'cover' })}
                    sizes="(max-width: 42rem) 100vw, 40rem"
                    alt="Screenshot from {title}"
                    loading="lazy"
                  />
                {:else}
                  <img
                    class="flightCard__carouselImg"
                    src={slideSrc(slide)}
                    srcset={cfImageSrcset(slide.url, CAROUSEL_WIDTHS)}
                    sizes="(max-width: 42rem) 100vw, 40rem"
                    alt="Photo {slideIndex - photoOffset + 1} of {photos.length}, taken at T{(slide.t ?? 0) < 0
                      ? '-'
                      : '+'}{formatElapsed(Math.abs(slide.t ?? 0))}"
                    loading="lazy"
                  />
                {/if}
              </a>
            {/key}
            {#if slides.length > 1}
              <button
                class="flightCard__carouselNav flightCard__carouselNav--prev"
                type="button"
                aria-label="Previous image"
                onclick={() => stepSlide(-1)}
              >
                ◀
              </button>
              <button
                class="flightCard__carouselNav flightCard__carouselNav--next"
                type="button"
                aria-label="Next image"
                onclick={() => stepSlide(1)}
              >
                ▶
              </button>
            {/if}
            {#if isAdmin && slide.kind === 'screenshot'}
              <label class="flightCard__screenshotReplace">
                {uploadingScreenshot ? 'uploading…' : 'replace'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={onScreenshotPick} />
              </label>
            {/if}
          </div>
          {#if slides.length > 1 || (isAdmin && !details.screenshotUrl)}
            <div class="flightCard__carouselBar">
              <span class="flightCard__carouselCount" aria-live="polite">{slideIndex + 1} / {slides.length}</span>
              {#if slides.length > 1}
                <div class="flightCard__carouselDots">
                  {#each slides as s, i (`${s.kind}:${s.url}`)}
                    <button
                      class="flightCard__carouselDot"
                      class:flightCard__carouselDot--active={i === slideIndex}
                      type="button"
                      aria-label={s.kind === 'screenshot' ? 'Screenshot' : `Photo ${i - photoOffset + 1}`}
                      aria-current={i === slideIndex ? 'true' : undefined}
                      onclick={() => showSlide(i)}
                    ></button>
                  {/each}
                </div>
              {/if}
              {#if isAdmin && !details.screenshotUrl}
                <label class="flightCard__screenshotAdd flightCard__screenshotAdd--bar">
                  {uploadingScreenshot ? 'uploading…' : '+ add screenshot'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={onScreenshotPick} />
                </label>
              {/if}
              {#if slide.t != null}
                <span class="flightCard__carouselTime">
                  T{slide.t < 0 ? '-' : '+'}{formatElapsed(Math.abs(slide.t))}
                </span>
              {/if}
            </div>
          {/if}
        </div>
      {:else if isAdmin}
        <label class="flightCard__screenshotAdd">
          {uploadingScreenshot ? 'uploading…' : '+ add screenshot'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={onScreenshotPick} />
        </label>
      {/if}
      <div class="flightCard__viz">
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
          {#if avgFuelFlowGph != null}
            <div class="flightCard__statRow">
              <span class="flightCard__statLabel">Avg burn</span>
              <span class="flightCard__statValue">
                {avgFuelFlowGph} gph
                {#if limits.book}
                  <span class="flightCard__statSub" title="POH {limits.book.setting}">
                    book {limits.book.cruiseGph}
                  </span>
                {/if}
              </span>
            </div>
          {/if}
          {#if nmPerGal != null}
            <div class="flightCard__statRow">
              <span class="flightCard__statLabel">Economy</span>
              <span class="flightCard__statValue">
                {nmPerGal} nm/gal
                {#if bookNmPerGal != null}
                  <span class="flightCard__statSub" title="POH still-air {limits.book?.setting}">
                    book {bookNmPerGal.toFixed(1)}
                  </span>
                {/if}
              </span>
            </div>
          {/if}
          {#if reserve}
            <div class="flightCard__statRow">
              <span class="flightCard__statLabel">Reserve at landing</span>
              <span class="flightCard__statValue">
                {reserve.gal.toFixed(1)} gal
                <span class="flightCard__statSub">≈ {formatDuration(reserve.sec)}</span>
              </span>
            </div>
          {/if}
          {#if details.avgHeadwindKt != null && details.avgHeadwindKt !== 0}
            <div class="flightCard__statRow">
              <span class="flightCard__statLabel">Wind</span>
              <span class="flightCard__statValue">
                {Math.abs(details.avgHeadwindKt)} kt {details.avgHeadwindKt > 0 ? 'headwind' : 'tailwind'}
                {#if windCost}
                  <span class="flightCard__statSub" title="Versus the same track in still air">
                    {windCost.label}
                    {windCost.text}
                  </span>
                {/if}
              </span>
            </div>
          {/if}
          {#if conditions}
            <div class="flightCard__statRow">
              <span class="flightCard__statLabel">Conditions</span>
              <span class="flightCard__statValue">
                {conditions.label}
                {#if conditions.sub}
                  <span class="flightCard__statSub">{conditions.sub}</span>
                {/if}
              </span>
            </div>
          {/if}
          {#if details.maxG != null}
            <div class="flightCard__statRow">
              <span class="flightCard__statLabel">Max G</span>
              <span class="flightCard__statValue">{details.maxG}G</span>
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
                <span class="flightCard__statSub">
                  {details.landingRateFpm} fpm{#if details.bounces}
                    · {details.bounces} bounce{details.bounces === 1 ? '' : 's'}{/if}
                </span>
              </span>
            </div>
          {/if}
        </div>
        {#if hasTrack}
          <!-- Hovering hands a parked pointer back to the visitor -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flightCard__chart" bind:this={chartEl} onpointerenter={() => releasePointer()}>
            <ChartGroup bind:state={groupState} pointer={{ tooltip: true }} brush={false} domain={false} series={false}>
              <div class="flightCard__elevation" bind:clientWidth={elevW} bind:clientHeight={elevH}>
                {#snippet planePoint({
                  points
                }: {
                  points: Array<{ x: number; y: number; fill: string; data: unknown }>;
                })}
                  {#if points.length > 0}
                    {@const pt = points.reduce((a, b) => (b.y < a.y ? b : a))}
                    <path
                      class="flightCard__scrubPlane"
                      d={PLANE_SIDE_PATH}
                      transform="translate({pt.x}, {pt.y}) scale(0.055) translate(-260, -256)"
                    />
                  {/if}
                {/snippet}
                <AreaChart
                  data={chartData}
                  axis={false}
                  seriesLayout="overlap"
                  tooltipContext={{ mode: 'bisect-x' }}
                  padding={{ top: 12, right: 0, bottom: 12, left: 0 }}
                  x="time"
                  y="alt"
                  yDomain={[0, yCeil]}
                  yNice={false}
                  xDomain={zoomDomain}
                  annotations={[...imcAnnotations, ...pauseAnnotations, ...photoAnnotations]}
                  grid={false}
                  rule={false}
                  legend={false}
                  highlight={{ lines: true, points: planePoint }}
                  brush={{ zoomOnBrush: false, onBrushEnd: handleBrushEnd }}
                  series={[
                    ...(groundData.length > 0
                      ? [
                          {
                            key: 'ground',
                            label: 'Terrain',
                            data: groundData,
                            value: (d: ChartPoint) => d.alt,
                            color: 'var(--subtle)',
                            props: { opacity: 0.18, line: false }
                          }
                        ]
                      : []),
                    { key: 'alt', label: 'Altitude', value: (d: ChartPoint) => d.alt, color: 'var(--fg)' }
                  ]}
                  props={{ area: { opacity: 0 } }}
                >
                  {#snippet tooltip({ context })}
                    <!-- Kept inside the card (no portal) so it inherits the mono
                         font. Altitude and terrain come from the hovered point;
                         the wind rows are looked up from the channels. -->
                    <Tooltip.Root {context} portal={false} xOffset={20} yOffset={20}>
                      {#snippet children({ data }: { data: ChartPoint })}
                        {@const sec = data.t}
                        {@const wind = windAt(sec)}
                        <Tooltip.Header value="T{sec < 0 ? '-' : '+'}{formatElapsed(Math.abs(sec))}" />
                        <Tooltip.List>
                          <Tooltip.Item
                            label="Altitude"
                            value="{Math.round(data.alt).toLocaleString()} ft"
                            valueAlign="right"
                          />
                          {#if groundData.length > 0}
                            <Tooltip.Item
                              label="Terrain"
                              value="{Math.round(groundAt(sec)).toLocaleString()} ft"
                              valueAlign="right"
                            />
                          {/if}
                          {#if wind}
                            <Tooltip.Separator />
                            {#each windRows(wind) as row (row.label)}
                              <Tooltip.Item label={row.label} value={row.value} valueAlign="right" />
                            {/each}
                          {/if}
                        </Tooltip.List>
                      {/snippet}
                    </Tooltip.Root>
                  {/snippet}
                </AreaChart>
                {#if windArrows.length > 0}
                  <svg class="flightCard__windLayer" aria-hidden="true">
                    {#each windArrows as arrow (arrow.t)}
                      {#if arrow.len > 0}
                        <path
                          class="flightCard__windArrow"
                          d={arrowPath(arrow.len)}
                          transform="translate({arrow.x}, {WIND_ARROW_Y}) rotate({arrow.headwind ? 180 : 0})"
                        >
                          <title>{arrow.label}</title>
                        </path>
                      {:else}
                        <circle class="flightCard__windCalm" cx={arrow.x} cy={WIND_ARROW_Y} r="1.5">
                          <title>{arrow.label}</title>
                        </circle>
                      {/if}
                    {/each}
                  </svg>
                {/if}
                {#each chartPhotoPins as pin (pin.url)}
                  <button
                    class="flightCard__photoDot flightCard__photoDot--chart"
                    style:left="{pin.x}px"
                    style:top="{pin.y}px"
                    aria-label="View photo taken at this moment"
                    onmouseenter={() => enterPin(pin, 'chart')}
                    onmouseleave={leavePin}
                    onfocus={() => enterPin(pin, 'chart')}
                    onblur={leavePin}
                    onclick={() => openPhoto(pin.index)}
                  ></button>
                {/each}
                {#if activePin && activePinArea === 'chart'}
                  {@const chartPin = activePin}
                  <button
                    class="flightCard__photoPopover"
                    class:flightCard__photoPopover--below={chartPin.y < 130}
                    style:left="{chartPin.x}px"
                    style:top="{chartPin.y}px"
                    type="button"
                    aria-label="Open photo {chartPin.index + 1} in the carousel"
                    onmouseenter={() => clearTimeout(pinTimer)}
                    onmouseleave={leavePin}
                    onclick={() => openPhoto(chartPin.index)}
                  >
                    <img src={previewSrc(chartPin.url)} alt="" loading="lazy" />
                  </button>
                {/if}
              </div>
            </ChartGroup>
            {#if phaseStrip.length > 0}
              <div class="flightCard__phaseStrip">
                {#each phaseStrip as seg, i (i)}
                  <span
                    class="flightCard__phaseSeg flightCard__phaseSeg--{seg.key}"
                    style:left="{seg.left.toFixed(2)}%"
                    style:width="{seg.width.toFixed(2)}%"
                    title={seg.label}
                  ></span>
                {/each}
              </div>
              {#if fuelPhaseSegments.length > 0}
                <div class="flightCard__phaseLegend">
                  {#each fuelPhaseSegments as seg (seg.key)}
                    <span class="flightCard__phaseItem">
                      <span class="flightCard__phaseSwatch flightCard__phaseSwatch--{seg.key}"></span>
                      {seg.glyph}
                      {seg.label}
                      {seg.gal} gal
                      <span class="flightCard__statSub">{formatDuration(seg.sec)} · {seg.gph.toFixed(1)} gph</span>
                    </span>
                  {/each}
                </div>
              {/if}
            {/if}
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
                        <div class="flightCard__gaugeLabel">{limits.propGearRatio ? 'PROP' : 'RPM'}</div>
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
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flightCard__mapWrap" bind:this={mapWrapEl} onpointerenter={() => releasePointer(true)}>
            <div class="flightCard__map" {@attach flightMap(mode.current === 'dark' ? 'dark' : 'light')}></div>
            <button
              class="flightCard__play"
              type="button"
              aria-label={playing ? 'Pause flight replay' : 'Play flight replay'}
              onclick={toggleReplay}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            {#each photoPins as pin (pin.url)}
              <button
                class="flightCard__photoDot"
                style:left="{pin.x}px"
                style:top="{pin.y}px"
                aria-label="View photo taken at this point"
                onmouseenter={() => enterPin(pin)}
                onmouseleave={leavePin}
                onfocus={() => enterPin(pin)}
                onblur={leavePin}
                onclick={() => openPhoto(pin.index)}
              ></button>
            {/each}
            {#if activePin && activePinArea === 'map'}
              {@const mapPin = activePin}
              <button
                class="flightCard__photoPopover"
                class:flightCard__photoPopover--below={mapPin.y < 150}
                style:left="{mapPin.x}px"
                style:top="{mapPin.y}px"
                type="button"
                aria-label="Open photo {mapPin.index + 1} in the carousel"
                onmouseenter={() => clearTimeout(pinTimer)}
                onmouseleave={leavePin}
                onclick={() => openPhoto(mapPin.index)}
              >
                <img src={previewSrc(mapPin.url)} alt="" loading="lazy" />
              </button>
            {/if}
          </div>
        {/if}
      </div>
      {#if hasTrack}
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
{/snippet}

<svelte:window onclick={onWindowClick} />

{#if embedded}
  {@render card()}
{:else}
  <ActivityItem type="flight" {timestamp} {isPrivate} {isAdmin} {onHide}>
    {@render card()}
  </ActivityItem>
{/if}

<style>
  .flightCard {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .flightCard__screenshotReplace {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-family: var(--codeFont);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--visBg);
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .flightCard__carouselStage:hover .flightCard__screenshotReplace,
  .flightCard__screenshotReplace:focus-within {
    opacity: 1;
  }

  .flightCard__screenshotReplace:hover {
    border-color: var(--fg);
  }

  .flightCard__screenshotAdd {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--visBg);
    color: var(--subtle);
    font-family: var(--codeFont);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.4rem;
    cursor: pointer;
  }

  .flightCard__screenshotAdd:hover {
    color: var(--fg);
    border-color: var(--fg);
  }

  .flightCard__trip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem;
    font-family: var(--codeFont);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .flightCard__tripChip {
    color: var(--subtle);
    border: 1px solid var(--visBg);
    padding: 0.15rem 0.45rem;
  }

  .flightCard__tripChip--stop {
    color: var(--fg);
    border-color: var(--fg);
  }

  .flightCard__tripEdit,
  .flightCard__tripAdd,
  .flightCard__tripButton {
    font: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    color: var(--subtle);
    background: var(--bg);
    border: 1px dashed var(--visBg);
    padding: 0.15rem 0.45rem;
    cursor: pointer;
  }

  .flightCard__tripEdit {
    opacity: 0;
    transition: opacity 0.15s;
  }

  .flightCard:hover .flightCard__tripEdit,
  .flightCard__tripEdit:focus-visible {
    opacity: 1;
  }

  .flightCard__tripEdit:hover,
  .flightCard__tripAdd:hover,
  .flightCard__tripButton:hover {
    color: var(--fg);
    border-color: var(--fg);
  }

  .flightCard__tripButton {
    border-style: solid;
  }

  .flightCard__tripButton--clear {
    margin-left: auto;
  }

  .flightCard__tripForm {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem;
    width: 100%;
  }

  .flightCard__tripInput {
    font: inherit;
    letter-spacing: inherit;
    text-transform: none;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--visBg);
    padding: 0.15rem 0.45rem;
    min-width: 0;
    flex: 1 1 8rem;
  }

  .flightCard__tripInput--stop {
    flex: 2 1 12rem;
  }

  .flightCard__tripInput:focus {
    outline: none;
    border-color: var(--fg);
  }

  .flightCard__tripError {
    color: var(--fg);
    flex-basis: 100%;
    text-transform: none;
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
    padding: 0.25rem 0.75rem 0.5rem;
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

  /* Flight-phase strip on the altitude chart's time axis. Climb and descent
     are hatched in the direction they read (/ rising, \ falling); cruise
     is a flat light fill. CSS gradient angles point the gradient line, and
     the stripes run perpendicular to it: 135deg gives "/", 45deg gives "\". */
  .flightCard__phaseStrip {
    position: relative;
    height: 0.625rem;
    margin-top: 0.25rem;
    background: var(--visBg);
  }

  .flightCard__phaseSeg {
    position: absolute;
    top: 0;
    height: 100%;
  }

  .flightCard__phaseSwatch {
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
  }

  .flightCard__phaseSeg--climb,
  .flightCard__phaseSwatch--climb {
    background: repeating-linear-gradient(135deg, var(--fg) 0 1.5px, transparent 1.5px 4.5px);
    opacity: 0.25;
  }

  .flightCard__phaseSeg--descent,
  .flightCard__phaseSwatch--descent {
    background: repeating-linear-gradient(45deg, var(--fg) 0 1.5px, transparent 1.5px 4.5px);
    opacity: 0.25;
  }

  .flightCard__phaseSeg--cruise,
  .flightCard__phaseSwatch--cruise {
    background: var(--fg);
    opacity: 0.25;
  }

  .flightCard__phaseLegend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    padding: 0.375rem 0 0.125rem;
    font-family: var(--codeFont);
    font-size: 0.75rem;
  }

  .flightCard__phaseItem {
    display: inline-flex;
    align-items: baseline;
    gap: 0.375rem;
    white-space: nowrap;
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

  .flightCard__mapWrap {
    position: relative;
  }

  .flightCard__map {
    width: 100%;
    height: 16rem;
    overflow: hidden;
    background: var(--subtle);
  }

  .flightCard__play {
    position: absolute;
    bottom: 0.625rem;
    left: 0.625rem;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--codeFont);
    font-size: 0.75rem;
    color: var(--fg);
    background: var(--bg);
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .flightCard__play:hover {
    background: var(--fg);
    color: var(--bg);
  }

  .flightCard__play:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
  }

  .flightCard__elevation {
    font-size: 0.6875rem;
    /* Cascades into the SVG axis labels, legend, and the tooltip */
    font-family: var(--codeFont);
  }

  .flightCard__elevation {
    height: 9rem;
    position: relative;
  }

  .flightCard__gauges {
    display: flex;
    justify-content: center;
    gap: 2.5rem;
    padding: 0.75rem 0 0.5rem;
    font-family: var(--codeFont);
  }

  /* The 240° arc (radius = half the dial height) ends at cos 60° below the
     centre, so the bottom quarter of the dial box is empty. The cell is
     sized to the drawn part and the dial overflows it, so the gap under
     the dials matches the gap above. (A negative margin would be zeroed by
     the post page's `.flightTrip *` reset.) */
  .flightCard__gaugeCell {
    --gaugeH: 5.25rem;
    height: calc(var(--gaugeH) * 0.75);
  }

  .flightCard__gauge {
    position: relative;
    width: 9.5rem;
    height: var(--gaugeH);
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
  .flightCard__elevation :global(.flightCard__pauseLine) {
    stroke: var(--subtle);
    stroke-dasharray: 3 3;
    stroke-width: 1px;
  }

  .flightCard__elevation :global(.lc-area-line) {
    stroke-width: 2.5px;
  }

  .flightCard__elevation :global(.lc-axis-tick-label) {
    fill: var(--subtle);
  }

  /* LayerChart's default tooltip is a 90% color-mix with a 2px backdrop
     blur; over the altitude trace that reads as smeared. Solid, square,
     bordered like the photo popovers. */
  .flightCard__elevation :global(.lc-tooltip-container) {
    color: var(--fg);
    background: var(--bg);
    backdrop-filter: none;
    box-shadow: none;
    border: 1px solid var(--visBg);
    border-radius: 0;
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

  .flightCard__windLayer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .flightCard__windArrow {
    fill: none;
    stroke: var(--subtle);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.45;
  }

  .flightCard__windCalm {
    fill: var(--subtle);
    opacity: 0.45;
  }

  .flightCard__photoDot {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--fg);
    border: 2px solid var(--bg);
    transform: translate(-50%, -50%);
    padding: 0;
    cursor: pointer;
  }

  .flightCard__photoDot--chart {
    width: 16px;
    height: 16px;
    background: transparent;
    border: none;
    border-radius: 50%;
  }

  .flightCard__photoDot:hover,
  .flightCard__photoDot:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: 1px;
  }

  .flightCard__photoPopover {
    position: absolute;
    transform: translate(-50%, calc(-100% - 12px));
    background: var(--bg);
    border: 1px solid var(--visBg);
    padding: 2px;
    display: block;
    z-index: 5;
    cursor: pointer;
  }

  .flightCard__photoPopover:hover,
  .flightCard__photoPopover:focus-visible {
    border-color: var(--fg);
  }

  .flightCard__photoPopover--below {
    transform: translate(-50%, 14px);
  }

  .flightCard__photoPopover img {
    display: block;
    width: 192px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    background: var(--visBg);
  }

  .flightCard__carousel {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    outline: none;
  }

  /* Fixed 32:9 stage: every slide renders into the same box, so stepping
     never shifts the card below it. The screenshot fills it (cover, as the
     hero always did); photos letterbox (contain) so an off-ratio shot is
     never cropped. */
  .flightCard__carouselStage {
    position: relative;
    aspect-ratio: 32 / 9;
    background: var(--visBg);
    overflow: hidden;
  }

  .flightCard__carouselLink {
    display: block;
    height: 100%;
  }

  .flightCard__carouselImg {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .flightCard__carouselImg--hero {
    object-fit: cover;
  }

  /* Same 2rem square as the map's play button */
  .flightCard__carouselNav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--codeFont);
    font-size: 0.75rem;
    color: var(--fg);
    background: var(--bg);
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .flightCard__carouselNav--prev {
    left: 0.625rem;
  }

  .flightCard__carouselNav--next {
    right: 0.625rem;
  }

  .flightCard__carouselNav:hover {
    background: var(--fg);
    color: var(--bg);
  }

  .flightCard__carouselNav:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
  }

  .flightCard__carouselBar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: var(--codeFont);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--subtle);
  }

  .flightCard__carouselCount {
    white-space: nowrap;
  }

  .flightCard__carouselTime {
    margin-left: auto;
    white-space: nowrap;
  }

  .flightCard__carouselDots {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .flightCard__carouselDot {
    width: 8px;
    height: 8px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--subtle);
    background: transparent;
    cursor: pointer;
  }

  .flightCard__carouselDot--active {
    background: var(--fg);
    border-color: var(--fg);
  }

  .flightCard__screenshotAdd--bar {
    font-size: inherit;
    padding: 0.15rem 0.45rem;
  }

  .flightCard__elevation :global(.flightCard__photoTick) {
    fill: var(--subtle);
    stroke: var(--bg);
    stroke-width: 1.5px;
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

    /* Cells share the row; the dial fills its cell up to a cap, so three
       always fit inside the card no matter how narrow the phone. */
    .flightCard__gaugeCell {
      --gaugeH: 3.4rem;
      flex: 1;
      min-width: 0;
    }

    .flightCard__gauge {
      width: 100%;
      max-width: 5.75rem;
      margin-inline: auto;
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
