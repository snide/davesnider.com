<script lang="ts">
  import type { FlightLanding, FlightTouchdown } from '$db/schema';

  interface Props {
    landing: FlightLanding;
    // POH approach speed for the airframe; the speed tile compares against it
    vrefKt?: number | null;
    // Hand a touchdown's flight-clock time back to the card (parks the shared
    // pointer on the elevation chart, gauges and map)
    onSelectTouchdown?: (t: number) => void;
  }

  let { landing, vrefKt = null, onSelectTouchdown }: Props = $props();

  // ---- Flare profile: AGL over the last half minute -------------------------
  // The window ends shortly after the last touchdown so a skip is a visible
  // hump rather than a blip at the right edge.
  const FLARE_BEFORE_SEC = 30;
  const FLARE_AFTER_SEC = 6;
  const FLARE_PAD = { top: 14, right: 8, bottom: 30, left: 30 };
  const FLOAT_AGL_FT = 10;

  let flareW = $state(0);
  let flareH = $state(0);

  let first = $derived(landing.touchdowns[0]);
  let lastTd = $derived(landing.touchdowns[landing.touchdowns.length - 1]);
  let flareT0 = $derived(Math.max(landing.t[0], -FLARE_BEFORE_SEC));
  // A touch-and-go's window runs past the liftoff so the climb-out shows
  let flareT1 = $derived(Math.min(landing.t[landing.t.length - 1], (landing.liftoffT ?? lastTd.t) + FLARE_AFTER_SEC));

  let flareIdx = $derived.by(() => {
    const out: number[] = [];
    for (let i = 0; i < landing.t.length; i++) {
      if (landing.t[i] >= flareT0 && landing.t[i] <= flareT1) out.push(i);
    }
    return out;
  });

  let flareMaxAgl = $derived(Math.max(30, ...flareIdx.map((i) => landing.agl[i])) * 1.12);

  // Square-root height scale: a 500 fpm final is 250 ft up half a minute
  // out, and on a linear scale a three-foot skip is a pixel. The root
  // gives the last twenty feet a third of the plot; the labelled gridlines
  // keep it honest.
  const FLARE_GRID_FT = [10, 50, 100, 200, 400, 800];
  let flareGrid = $derived(FLARE_GRID_FT.filter((ft) => ft < flareMaxAgl * 0.92));

  function fx(t: number): number {
    const span = flareT1 - flareT0 || 1;
    return FLARE_PAD.left + ((t - flareT0) / span) * (flareW - FLARE_PAD.left - FLARE_PAD.right);
  }
  function fy(agl: number): number {
    const inner = flareH - FLARE_PAD.top - FLARE_PAD.bottom;
    return FLARE_PAD.top + inner - Math.sqrt(Math.max(0, agl) / flareMaxAgl) * inner;
  }

  let flareLine = $derived(
    flareIdx
      .map((i, k) => `${k === 0 ? 'M' : 'L'}${fx(landing.t[i]).toFixed(1)},${fy(landing.agl[i]).toFixed(1)}`)
      .join('')
  );

  // Ten-second grid back from the first touchdown
  let flareTicks = $derived.by(() => {
    const ticks: number[] = [];
    for (let t = 0; t >= flareT0; t -= 10) ticks.push(t);
    return ticks.reverse();
  });

  // Touchdown labels alternate rows when two land close together (a bounce
  // is often a second apart — a handful of pixels here)
  let flareMarks = $derived.by(() => {
    let lastX = -Infinity;
    let row = 0;
    const marks = landing.touchdowns.map((td, i) => {
      const x = fx(td.t);
      row = x - lastX < 64 ? 1 - row : 0;
      lastX = x;
      return { td, i, x, row, anchor: 'middle' as 'middle' | 'start' | 'end' };
    });
    // Close pairs also split left/right so the text never touches
    for (let i = 1; i < marks.length; i++) {
      if (marks[i].row === 1) {
        marks[i].anchor = 'start';
        if (marks[i - 1].anchor === 'middle') marks[i - 1].anchor = 'end';
      }
    }
    return marks;
  });

  // Hover crosshair: nearest sample by time
  let flareHover = $state<number | null>(null);
  function onFlareMove(event: PointerEvent) {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = event.clientX - rect.left;
    let best: number | null = null;
    let bestD = Infinity;
    for (const i of flareIdx) {
      const d = Math.abs(fx(landing.t[i]) - px);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    }
    flareHover = best;
  }

  // ---- Rollout strip: the runway from above, width to scale --------------
  // Length is compressed to fit; width is real when the runway is known, so
  // an offset reads as a fraction of the pavement. Without a runway the
  // strip is scaled to the drift and a 50 ft bar gives the scale.
  const ROLL_PAD = { top: 10, right: 10, bottom: 18, left: 10 };
  const ROLL_MIN_HALF_FT = 25;

  let rollW = $state(0);
  let rollH = $state(0);

  // Short final's last seconds through the rollout; a touch-and-go stops a
  // moment after liftoff so the climb-out doesn't stretch the strip
  let rollEndT = $derived(landing.liftoffT != null ? landing.liftoffT + 1.5 : Infinity);
  let rollIdx = $derived.by(() => {
    const out: number[] = [];
    for (let i = 0; i < landing.t.length; i++) if (landing.t[i] >= -3 && landing.t[i] <= rollEndT) out.push(i);
    return out;
  });

  // With a runway the horizontal range is the whole runway, threshold at
  // the left and far end at the right, so touchdown points and rollout
  // lengths line up between landings (a track past either end extends it).
  // Without one the range fits the track.
  let showThreshold = $derived(landing.runway != null);
  // A pre-threshold pad (like a displaced threshold's) carries the arrows
  const PAD_FRACTION = 0.2;
  let padFt = $derived(landing.runway ? landing.runway.lengthFt * PAD_FRACTION : 0);
  let rollD0 = $derived(Math.min(landing.runway ? -padFt : Infinity, ...rollIdx.map((i) => landing.d[i])));
  let rollD1 = $derived(Math.max(landing.runway?.lengthFt ?? -Infinity, ...rollIdx.map((i) => landing.d[i])));
  let rollMaxAbs = $derived(Math.max(...rollIdx.map((i) => Math.abs(landing.x[i]))));
  // With a runway the scale is fixed by the pavement: the strip spans one
  // runway width either side of the centerline, so the pavement is always
  // the same height and landings compare directly. A track that leaves the
  // strip is clipped — it left the runway by a long way. Without a runway
  // the strip scales to the drift.
  let rollHalf = $derived(
    landing.runway?.widthFt ? landing.runway.widthFt : Math.max(ROLL_MIN_HALF_FT, rollMaxAbs * 1.25)
  );
  // rollHalf is never less than the half width, so the edges always fit
  let runwayEdgesOnStrip = $derived((landing.runway?.widthFt ?? 0) > 0);
  const ROLL_CLIP_ID = `landingRollClip-${Math.random().toString(36).slice(2, 8)}`;

  // Painted designator just past the threshold (or the strip's left edge
  // when the threshold is off it), sized to the pavement and rotated so it
  // reads to a pilot arriving from the left, like the real paint.
  let runwayMark = $derived.by(() => {
    if (!landing.runway?.widthFt) return null;
    const pavement = ry(landing.runway.widthFt / 2) - ry(-landing.runway.widthFt / 2);
    const size = Math.max(8, Math.min(16, pavement * 0.4));
    const x = (showThreshold ? rx(0) : ROLL_PAD.left) + 10 + size / 2;
    return { ident: landing.runway.ident, x, y: ry(0), size };
  });

  // Threshold arrows as painted on a real pre-threshold pad: chevrons
  // before the bar pointing at it, in the same muted paint as the
  // designator that follows the bar
  let runwayChevrons = $derived.by(() => {
    if (!landing.runway?.widthFt) return null;
    const pavement = ry(landing.runway.widthFt / 2) - ry(-landing.runway.widthFt / 2);
    const h = Math.max(6, Math.min(12, pavement * 0.34)); // half height of a chevron
    const w = h * 0.75;
    const gap = w + 4;
    const room = rx(0) - rx(-padFt) - 10;
    const count = Math.max(1, Math.min(3, Math.floor(room / gap)));
    const endX = rx(0) - 6;
    const xs = Array.from({ length: count }, (_, k) => endX - (count - 1 - k) * gap);
    const y = ry(0);
    return xs.map(
      (x) =>
        `${(x - w).toFixed(1)},${(y - h).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)} ${(x - w).toFixed(1)},${(y + h).toFixed(1)}`
    );
  });

  function rx(d: number): number {
    const span = rollD1 - rollD0 || 1;
    return ROLL_PAD.left + ((d - rollD0) / span) * (rollW - ROLL_PAD.left - ROLL_PAD.right);
  }
  function ry(x: number): number {
    const inner = rollH - ROLL_PAD.top - ROLL_PAD.bottom;
    // Seen from above with the runway running left to right in the landing
    // direction, right of the centerline is below the line.
    return ROLL_PAD.top + inner / 2 + (x / rollHalf) * (inner / 2);
  }

  let rollGround = $derived(
    rollIdx
      .filter((i) => landing.agl[i] <= 1)
      .map((i, k) => `${k === 0 ? 'M' : 'L'}${rx(landing.d[i]).toFixed(1)},${ry(landing.x[i]).toFixed(1)}`)
      .join('')
  );
  // Airborne bits dashed: the last of the approach, and after a
  // touch-and-go's liftoff the start of the climb-out
  function airPath(pick: (i: number) => boolean): string {
    return rollIdx
      .filter((i) => landing.agl[i] > 1 && pick(i))
      .map((i, k) => `${k === 0 ? 'M' : 'L'}${rx(landing.d[i]).toFixed(1)},${ry(landing.x[i]).toFixed(1)}`)
      .join('');
  }
  let rollAirBefore = $derived(airPath((i) => landing.t[i] <= first.t));
  let rollAirAfter = $derived(airPath((i) => landing.t[i] > lastTd.t));

  // Distance ticks along the bottom edge
  let rollTicks = $derived.by(() => {
    const span = rollD1 - rollD0;
    const plotW = Math.max(1, rollW - ROLL_PAD.left - ROLL_PAD.right);
    // Labels need ~70 px each
    const step = [500, 1000, 2000, 5000, 10000].find((st) => (span / st) * 70 <= plotW) ?? 10000;
    const ticks: number[] = [];
    for (let d = Math.ceil(rollD0 / step) * step; d <= rollD1; d += step) ticks.push(d + 0);
    // The threshold and far end have their own labels; drop ticks that would sit on them
    const endX = landing.runway ? rx(landing.runway.lengthFt) : Infinity;
    return showThreshold ? ticks.filter((d) => d === 0 || (rx(d) - rx(0) > 60 && endX - rx(d) > 60)) : ticks;
  });

  // ---- Tiles ----------------------------------------------------------------
  let hardest = $derived(
    landing.touchdowns.reduce<FlightTouchdown>((a, b) => ((b.fpm ?? 0) < (a.fpm ?? 0) ? b : a), first)
  );
  let peakG = $derived(Math.max(...landing.touchdowns.map((td) => td.g ?? 0)) || null);
  let bounces = $derived(landing.touchdowns.length - 1);

  function side(deg: number, pos: string, neg: string): string {
    return `${Math.abs(deg).toFixed(Math.abs(deg) < 10 ? 1 : 0)}° ${deg >= 0 ? pos : neg}`;
  }

  function gearLabel(gear: FlightTouchdown['gear']): string | null {
    switch (gear) {
      case 'mains':
        return 'both mains';
      case 'left':
        return 'left main';
      case 'right':
        return 'right main';
      case 'nose':
        return 'nose wheel';
      case 'all':
        return 'three-point';
      default:
        return null;
    }
  }

  function fmtT(t: number): string {
    const sign = t < 0 ? '−' : '+';
    return `${sign}${Math.abs(t).toFixed(1)} s`;
  }

  function fmtFpm(fpm: number | null): string {
    return fpm == null ? '—' : `${fpm > 0 ? '+' : ''}${fpm} fpm`;
  }

  // Which readings disagreed: shown under the touchdown value so the number
  // is never a mystery
  let readings = $derived(
    [
      hardest.sensorFpm != null ? `sensor ${hardest.sensorFpm}` : null,
      hardest.worldVsFpm != null ? `velocity ${hardest.worldVsFpm}` : null,
      hardest.vsFpm != null ? `vsi ${hardest.vsFpm}` : null
    ]
      .filter(Boolean)
      .join(' · ')
  );
</script>

<div class="landingPanel">
  <div class="landingPanel__head">
    <span class="landingPanel__title">{landing.kind === 'touchAndGo' ? 'Touch-and-go' : 'Landing'}</span>
    <span class="landingPanel__meta">
      {#if landing.runway}RWY {landing.runway.ident} ·{/if}
      {landing.touchdowns.length === 1 ? 'one touchdown' : `${landing.touchdowns.length} touchdowns`}
      {#if landing.liftoffT != null}· {landing.liftoffT.toFixed(1)} s on the ground{/if}
    </span>
  </div>

  <!-- Always the same ten rows, two columns of five, so the columns stay
       even and stepping between landings never shifts the layout -->
  <div class="landingPanel__stats">
    <div class="landingPanel__statRow" title={readings}>
      <span class="landingPanel__statLabel">Touchdown</span>
      <span class="landingPanel__statValue">{fmtFpm(hardest.fpm)}</span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">Peak G</span>
      <span class="landingPanel__statValue">{peakG ? `${peakG.toFixed(2)}G` : '—'}</span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">Bounces</span>
      <span class="landingPanel__statValue">{bounces}</span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">Crab</span>
      <span class="landingPanel__statValue">{first.crabDeg != null ? side(first.crabDeg, 'right', 'left') : '—'}</span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">Speed at touchdown</span>
      <span class="landingPanel__statValue">
        {first.iasKt} kt
        {#if vrefKt}
          <span class="landingPanel__statSub" title="POH approach speed">
            {first.iasKt - vrefKt >= 0 ? '+' : '−'}{Math.abs(first.iasKt - vrefKt)} vs Vref {vrefKt}
          </span>
        {/if}
      </span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">Past threshold</span>
      <span class="landingPanel__statValue">
        {landing.touchdownFt != null ? `${landing.touchdownFt.toLocaleString()} ft` : '—'}
      </span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">Off centerline</span>
      <span class="landingPanel__statValue">
        {landing.centerlineMaxFt != null ? `${landing.centerlineMaxFt} ft` : '—'}
      </span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">Heading swing</span>
      <span class="landingPanel__statValue">{landing.headingMaxDeg != null ? `${landing.headingMaxDeg}°` : '—'}</span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">Float from 10 ft</span>
      <span class="landingPanel__statValue">{landing.floatSec != null ? `${landing.floatSec.toFixed(1)} s` : '—'}</span>
    </div>
    <div class="landingPanel__statRow">
      <span class="landingPanel__statLabel">First contact</span>
      <span class="landingPanel__statValue">{gearLabel(landing.gearFirst) ?? '—'}</span>
    </div>
  </div>

  <div class="landingPanel__charts">
    <figure class="landingPanel__figure landingPanel__figure--flare">
      <figcaption class="landingPanel__caption">Flare · feet above the runway, √ scale</figcaption>
      <div class="landingPanel__plot" bind:clientWidth={flareW} bind:clientHeight={flareH}>
        {#if flareW > 0 && flareH > 0}
          <svg
            class="landingPanel__svg"
            width={flareW}
            height={flareH}
            role="img"
            aria-label="Height above the runway over the last {Math.round(-flareT0)} seconds before touchdown"
            onpointermove={onFlareMove}
            onpointerleave={() => (flareHover = null)}
          >
            {#each flareTicks as t (t)}
              <line class="landingPanel__grid" x1={fx(t)} x2={fx(t)} y1={FLARE_PAD.top} y2={fy(0)} />
              <text class="landingPanel__axis" x={fx(t)} y={FLARE_PAD.top - 4} text-anchor="middle">
                {t === 0 ? '0' : `−${-t} s`}
              </text>
            {/each}
            {#each flareGrid as ft (ft)}
              <line
                class="landingPanel__grid"
                x1={FLARE_PAD.left}
                x2={flareW - FLARE_PAD.right}
                y1={fy(ft)}
                y2={fy(ft)}
              />
              <text class="landingPanel__axis" x={FLARE_PAD.left - 4} y={fy(ft) + 3} text-anchor="end">{ft}</text>
            {/each}
            {#if FLOAT_AGL_FT < flareMaxAgl}
              <line
                class="landingPanel__float"
                x1={FLARE_PAD.left}
                x2={flareW - FLARE_PAD.right}
                y1={fy(FLOAT_AGL_FT)}
                y2={fy(FLOAT_AGL_FT)}
              />
            {/if}
            <path class="landingPanel__line" d={flareLine} />
            <line
              class="landingPanel__ground"
              x1={FLARE_PAD.left}
              x2={flareW - FLARE_PAD.right}
              y1={fy(0)}
              y2={fy(0)}
            />
            {#each flareMarks as m (m.i)}
              <line class="landingPanel__tdTick" x1={m.x} x2={m.x} y1={fy(0)} y2={fy(0) + 6 + m.row * 12} />
              <text
                class="landingPanel__tdLabel"
                x={m.anchor === 'start' ? m.x + 3 : m.anchor === 'end' ? m.x - 3 : m.x}
                y={fy(0) + 16 + m.row * 12}
                text-anchor={m.anchor}
              >
                {m.td.fpm ?? '—'}{m.i === 0 ? ' fpm' : ''}
              </text>
            {/each}
            {#if flareHover != null}
              {@const i = flareHover}
              <line
                class="landingPanel__cross"
                x1={fx(landing.t[i])}
                x2={fx(landing.t[i])}
                y1={FLARE_PAD.top}
                y2={fy(0)}
              />
              <circle class="landingPanel__dot" cx={fx(landing.t[i])} cy={fy(landing.agl[i])} r="3.5" />
            {/if}
          </svg>
          {#each flareMarks as m (m.i)}
            <button
              class="landingPanel__tdButton"
              type="button"
              style:left="{m.x}px"
              style:top="{fy(0) + 6 + m.row * 12}px"
              title="Touchdown {m.i + 1}: {fmtFpm(m.td.fpm)}"
              aria-label="Show touchdown {m.i + 1} on the flight"
              onclick={() => onSelectTouchdown?.(landing.touchdownT + m.td.t)}
            ></button>
          {/each}
          {#if flareHover != null}
            {@const i = flareHover}
            <div
              class="landingPanel__tip"
              class:landingPanel__tip--left={fx(landing.t[i]) > flareW * 0.6}
              style:left="{fx(landing.t[i])}px"
            >
              <span>T{fmtT(landing.t[i])}</span>
              <span>{Math.round(landing.agl[i])} ft</span>
              <span>{fmtFpm(landing.vs[i])}</span>
              <span>{landing.ias[i]} kt</span>
              {#if landing.g[i]}<span>{landing.g[i].toFixed(2)} G</span>{/if}
            </div>
          {/if}
        {/if}
      </div>
    </figure>

    <figure class="landingPanel__figure landingPanel__figure--rollout">
      <figcaption class="landingPanel__caption">
        {landing.kind === 'touchAndGo' ? 'Ground roll' : 'Rollout'} · {landing.runway
          ? 'runway width to scale'
          : 'offset from the approach line'}
      </figcaption>
      <div class="landingPanel__plot landingPanel__plot--rollout" bind:clientWidth={rollW} bind:clientHeight={rollH}>
        {#if rollW > 0 && rollH > 0}
          <svg
            class="landingPanel__svg"
            width={rollW}
            height={rollH}
            role="img"
            aria-label="Ground track along the runway from touchdown to the end of the rollout"
          >
            {#if runwayEdgesOnStrip && landing.runway}
              <rect
                class="landingPanel__pavement landingPanel__pavement--pad"
                x={rx(-padFt)}
                y={ry(-landing.runway.widthFt / 2)}
                width={rx(0) - rx(-padFt)}
                height={ry(landing.runway.widthFt / 2) - ry(-landing.runway.widthFt / 2)}
              />
              <rect
                class="landingPanel__pavement"
                x={rx(0)}
                y={ry(-landing.runway.widthFt / 2)}
                width={rx(landing.runway.lengthFt) - rx(0)}
                height={ry(landing.runway.widthFt / 2) - ry(-landing.runway.widthFt / 2)}
              />
            {/if}
            {#if runwayMark}
              <!-- The stripe stops either side of the digits, like the paint -->
              <line
                class="landingPanel__centerline"
                x1={landing.runway ? rx(0) : ROLL_PAD.left}
                x2={runwayMark.x - runwayMark.size * 0.75}
                y1={ry(0)}
                y2={ry(0)}
              />
              <line
                class="landingPanel__centerline"
                x1={runwayMark.x + runwayMark.size * 0.75}
                x2={rollW - ROLL_PAD.right}
                y1={ry(0)}
                y2={ry(0)}
              />
            {:else}
              <line
                class="landingPanel__centerline"
                x1={ROLL_PAD.left}
                x2={rollW - ROLL_PAD.right}
                y1={ry(0)}
                y2={ry(0)}
              />
            {/if}
            {#if runwayMark}
              <text
                class="landingPanel__runwayMark"
                x={runwayMark.x}
                y={runwayMark.y}
                font-size={runwayMark.size}
                text-anchor="middle"
                dominant-baseline="central"
                transform="rotate(90 {runwayMark.x} {runwayMark.y})"
              >
                {runwayMark.ident}
              </text>
            {/if}
            {#each rollTicks as d (d)}
              <line
                class="landingPanel__grid"
                x1={rx(d)}
                x2={rx(d)}
                y1={rollH - ROLL_PAD.bottom}
                y2={rollH - ROLL_PAD.bottom + 4}
              />
              <text
                class="landingPanel__axis"
                x={rx(d)}
                y={rollH - 4}
                text-anchor={rx(d) < 30 ? 'start' : rx(d) > rollW - 30 ? 'end' : 'middle'}
              >
                {d === 0 && showThreshold ? 'threshold' : `${d.toLocaleString()} ft`}
              </text>
            {/each}
            {#if runwayChevrons}
              {#each runwayChevrons as pts, i (i)}
                <polyline class="landingPanel__chevron" points={pts} />
              {/each}
            {/if}
            {#if landing.runway}
              <line
                class="landingPanel__threshold"
                x1={rx(landing.runway.lengthFt)}
                x2={rx(landing.runway.lengthFt)}
                y1={ROLL_PAD.top}
                y2={rollH - ROLL_PAD.bottom}
              />
              <text class="landingPanel__axis" x={rx(landing.runway.lengthFt)} y={rollH - 4} text-anchor="end">
                {landing.runway.lengthFt.toLocaleString()} ft
              </text>
            {/if}
            {#if showThreshold}
              <line
                class="landingPanel__threshold"
                x1={rx(0)}
                x2={rx(0)}
                y1={ROLL_PAD.top}
                y2={rollH - ROLL_PAD.bottom}
              />
            {/if}
            <defs>
              <clipPath id={ROLL_CLIP_ID}>
                <rect x="0" y={ROLL_PAD.top - 2} width={rollW} height={rollH - ROLL_PAD.top - ROLL_PAD.bottom + 4} />
              </clipPath>
            </defs>
            <g clip-path="url(#{ROLL_CLIP_ID})">
              <path class="landingPanel__air" d={rollAirBefore} />
              <path class="landingPanel__air" d={rollAirAfter} />
              <path class="landingPanel__track" d={rollGround} />
              {#each landing.touchdowns as td, i (i)}
                <circle class="landingPanel__tdDot" cx={rx(td.d)} cy={ry(td.x)} r="4" />
              {/each}
            </g>
            {#if !runwayEdgesOnStrip}
              <line
                class="landingPanel__scale"
                x1={rollW - ROLL_PAD.right}
                x2={rollW - ROLL_PAD.right}
                y1={ry(0)}
                y2={ry(Math.min(50, rollHalf))}
              />
              <text
                class="landingPanel__axis"
                x={rollW - ROLL_PAD.right - 4}
                y={ry(Math.min(50, rollHalf) / 2) + 3}
                text-anchor="end"
              >
                {Math.round(Math.min(50, rollHalf))} ft
              </text>
            {/if}
          </svg>
        {/if}
      </div>
    </figure>
  </div>
</div>

<style>
  .landingPanel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border-top: 1px solid var(--visBg);
    font-size: 0.8125rem;
  }

  .landingPanel__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }

  .landingPanel__title {
    color: var(--subtle);
  }

  .landingPanel__meta {
    font-family: var(--codeFont);
    font-size: 0.75rem;
  }

  /* Same two columns and gutter as the table above, so the charts sit
     under the stat columns */
  .landingPanel__charts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 2rem;
    row-gap: 1rem;
    padding-top: 0.5rem;
  }

  .landingPanel__figure {
    margin: 0;
    min-width: 0;
  }

  .landingPanel__caption {
    color: var(--subtle);
    font-size: 0.6875rem;
    padding-bottom: 0.25rem;
  }

  .landingPanel__plot {
    position: relative;
    height: 8rem;
  }

  .landingPanel__plot--rollout {
    height: 8rem;
  }

  .landingPanel__svg {
    display: block;
    overflow: visible;
    touch-action: none;
  }

  .landingPanel__grid {
    stroke: var(--visBg);
    stroke-width: 1px;
  }

  .landingPanel__axis {
    fill: var(--subtle);
    font-family: var(--codeFont);
    font-size: 0.625rem;
  }

  .landingPanel__float {
    stroke: var(--subtle);
    stroke-width: 1px;
    stroke-dasharray: 2 3;
    opacity: 0.7;
  }

  .landingPanel__line {
    fill: none;
    stroke: var(--fg);
    stroke-width: 1.5px;
    stroke-linejoin: round;
  }

  .landingPanel__ground {
    stroke: var(--fg);
    stroke-width: 1px;
  }

  .landingPanel__tdTick {
    stroke: var(--fg);
    stroke-width: 1.5px;
  }

  .landingPanel__tdLabel {
    fill: var(--fg);
    font-family: var(--codeFont);
    font-size: 0.625rem;
  }

  .landingPanel__cross {
    stroke: var(--subtle);
    stroke-width: 1px;
  }

  .landingPanel__dot {
    fill: var(--fg);
    stroke: var(--bg);
    stroke-width: 2px;
  }

  /* Invisible hit target over each touchdown tick */
  .landingPanel__tdButton {
    position: absolute;
    width: 3rem;
    height: 12px;
    transform: translateX(-50%);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 2px;
  }

  .landingPanel__tdButton:focus-visible {
    outline: 1px solid var(--fg);
  }

  .landingPanel__tip {
    position: absolute;
    top: 0;
    /* The rollout plot is a later positioned sibling and would paint over a
       tooltip that spills past the flare's edge */
    z-index: 1;
    transform: translateX(10px);
    display: flex;
    gap: 0.5rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg);
    border: 1px solid var(--visBg);
    font-family: var(--codeFont);
    font-size: 0.6875rem;
    white-space: nowrap;
    pointer-events: none;
  }

  .landingPanel__tip--left {
    transform: translateX(calc(-100% - 10px));
  }

  /* Same fill as the terrain under the elevation profile */
  .landingPanel__pavement {
    fill: var(--subtle);
    opacity: 0.18;
  }

  .landingPanel__runwayMark {
    fill: var(--fg);
    opacity: 0.4;
    font-family: var(--codeFont);
    font-weight: 700;
    letter-spacing: -0.05em;
  }

  .landingPanel__pavement--pad {
    opacity: 0.1;
  }

  .landingPanel__chevron {
    fill: none;
    stroke: var(--fg);
    stroke-width: 2px;
    stroke-linejoin: round;
    stroke-linecap: round;
    opacity: 0.4;
  }

  .landingPanel__centerline {
    stroke: var(--subtle);
    stroke-width: 1px;
    stroke-dasharray: 8 6;
  }

  .landingPanel__threshold {
    stroke: var(--fg);
    stroke-width: 2px;
  }

  .landingPanel__air {
    fill: none;
    stroke: var(--subtle);
    stroke-width: 1.5px;
    stroke-dasharray: 3 3;
  }

  .landingPanel__track {
    fill: none;
    stroke: var(--fg);
    stroke-width: 2px;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .landingPanel__tdDot {
    fill: var(--fg);
    stroke: var(--bg);
    stroke-width: 2px;
  }

  .landingPanel__scale {
    stroke: var(--subtle);
    stroke-width: 1px;
  }

  /* Same two-column label / value rows as the flight stats above */
  .landingPanel__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 2rem;
  }

  .landingPanel__statRow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--visBg);
  }

  .landingPanel__statLabel {
    color: var(--subtle);
  }

  .landingPanel__statValue {
    font-family: var(--codeFont);
    text-align: right;
    white-space: nowrap;
  }

  .landingPanel__statSub {
    color: var(--subtle);
    font-size: 0.6875rem;
    margin-left: 0.375rem;
  }

  @media (max-width: 768px) {
    .landingPanel__stats,
    .landingPanel__charts {
      grid-template-columns: 1fr;
    }

    .landingPanel__plot {
      height: 7rem;
    }

    .landingPanel__plot--rollout {
      height: 6rem;
    }
  }
</style>
