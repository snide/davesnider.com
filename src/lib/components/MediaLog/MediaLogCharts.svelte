<script lang="ts">
  import { BarChart, PieChart } from 'layerchart';
  import type { Bucket, MediaLogFilter, MediaLogStats } from './stats.js';
  import type { MediaLogLabels } from './types.js';

  // The chart panels of a media log. Every bar, slice and name is a filter
  // toggle for the grid below; the charts themselves always show the whole
  // log so the active filter reads as a highlight, not a different chart.
  interface Props {
    stats: MediaLogStats;
    labels: MediaLogLabels;
    filter: MediaLogFilter | null;
    onFilter: (filter: MediaLogFilter) => void;
  }

  let { stats, labels, filter, onFilter }: Props = $props();

  type Dimension = MediaLogFilter['dimension'];
  type Datum = Bucket & { color: string; props?: { opacity: number } };

  // Grayscale as "% of --fg mixed into --bg" (the activity ribbon's trick),
  // so every shade follows the theme.
  function shade(percent: number): string {
    return `color-mix(in srgb, var(--fg) ${Math.round(percent)}%, var(--bg))`;
  }

  const DIMMED = 0.25;

  function isActive(dimension: Dimension, key: string): boolean {
    return filter?.dimension === dimension && filter.key === key;
  }

  function isDimmed(dimension: Dimension, key: string): boolean {
    return filter?.dimension === dimension && filter.key !== key;
  }

  // Bars are one solid color; a filter in the same chart fades the rest.
  function barData(dimension: Dimension, buckets: Bucket[]): Datum[] {
    return buckets.map((b) => ({ ...b, color: isDimmed(dimension, b.key) ? shade(DIMMED * 100) : 'var(--fg)' }));
  }

  // Slices step through a light→dark ramp in bucket order so neighbours stay
  // distinguishable without hue. Empty buckets are dropped (a zero-width
  // slice would still get a label).
  function pieData(dimension: Dimension, buckets: Bucket[]): Datum[] {
    const step = buckets.length > 1 ? 70 / (buckets.length - 1) : 0;
    return buckets
      .map((b, i) => ({
        ...b,
        color: shade(30 + i * step),
        ...(isDimmed(dimension, b.key) ? { props: { opacity: DIMMED } } : {})
      }))
      .filter((b) => b.count > 0);
  }

  let monthData = $derived(barData('month', stats.months));
  let decadeData = $derived(barData('decade', stats.decades));
  let weekdayData = $derived(pieData('weekday', stats.weekdays));
  let scoreData = $derived(pieData('score', stats.scores));

  function pick(dimension: Dimension, bucket: Bucket, label = bucket.label) {
    onFilter({ dimension, key: bucket.key, label });
  }

  const barPadding = { top: 20, right: 0, bottom: 20, left: 0 };
  const sliceLabel = (d: Datum) => `${d.label} · ${d.count}`;
</script>

<!-- Every value is already printed on the chart, so the hover tooltip is
     replaced with nothing. The tooltip context itself stays: it drives the
     hover highlight and the bar clicks. -->
{#snippet noTooltip()}{/snippet}

<!-- Bars are clicked through the tooltip's band overlay (it sits above the
     bars and takes the pointer), so the whole column is the hit target. -->
{#snippet bars(dimension: Dimension, data: Datum[], tick: (label: string) => string)}
  <BarChart
    {data}
    x="key"
    y="count"
    c="key"
    cDomain={data.map((d) => d.key)}
    cRange={data.map((d) => d.color)}
    axis="x"
    grid={false}
    rule={false}
    labels={{ offset: 4 }}
    bandPadding={0.65}
    padding={barPadding}
    series={[{ key: 'count', label: `${labels.nounPlural} ${labels.consumed}`, value: (d: Datum) => d.count }]}
    props={{
      bars: { radius: 0, strokeWidth: 0 },
      xAxis: { format: (key: string) => tick(data.find((d) => d.key === key)?.label ?? key), tickLength: 0 }
    }}
    tooltip={noTooltip}
    tooltipContext={{ onclick: (_e, { data: d }) => pick(dimension, d as Datum) }}
  />
{/snippet}

{#snippet pie(dimension: Dimension, data: Datum[], filterLabel: (d: Datum) => string)}
  <PieChart
    {data}
    key="key"
    label="label"
    value="count"
    c="color"
    innerRadius={0.55}
    padAngle={0.02}
    outerRadius={54}
    labels={{ placement: 'callout', value: sliceLabel, calloutLineLength: 8, calloutLabelOffset: 6 }}
    props={{ pie: { sort: null }, arc: { class: 'mediaLogCharts__arc' } }}
    tooltip={noTooltip}
    onArcClick={(_e, detail) => pick(dimension, detail.data as Datum, filterLabel(detail.data as Datum))}
  />
{/snippet}

<div class="mediaLogCharts">
  <div class="mediaLogCharts__grid">
    <figure class="mediaLogCharts__panel mediaLogCharts__panel--months">
      <figcaption class="mediaLogCharts__caption">{labels.consumed} per month</figcaption>
      <div class="mediaLogCharts__chart">
        {@render bars('month', monthData, (label) => label.slice(0, 3))}
      </div>
    </figure>

    <figure class="mediaLogCharts__panel mediaLogCharts__panel--weekdays">
      <figcaption class="mediaLogCharts__caption">Day of the week</figcaption>
      <div class="mediaLogCharts__chart">
        {@render pie('weekday', weekdayData, (d) => `${labels.consumed} on a ${d.label}`)}
      </div>
    </figure>

    <figure class="mediaLogCharts__panel mediaLogCharts__panel--creators">
      <figcaption class="mediaLogCharts__caption">Top {labels.creatorPlural}</figcaption>
      <ol class="mediaLogCharts__creators">
        {#each stats.creators as creator (creator.key)}
          <li class="mediaLogCharts__creatorItem">
            <button
              class="mediaLogCharts__creator"
              class:mediaLogCharts__creator--selected={isActive('creator', creator.key)}
              type="button"
              aria-pressed={isActive('creator', creator.key)}
              onclick={() => pick('creator', creator)}
            >
              <span class="mediaLogCharts__creatorName">{creator.label}</span>
              <span class="mediaLogCharts__creatorCount">{creator.count}</span>
            </button>
          </li>
        {/each}
      </ol>
    </figure>

    <figure class="mediaLogCharts__panel mediaLogCharts__panel--decades">
      <figcaption class="mediaLogCharts__caption">Release decade</figcaption>
      <div class="mediaLogCharts__chart">
        {@render bars('decade', decadeData, (label) => label)}
      </div>
    </figure>

    <figure class="mediaLogCharts__panel mediaLogCharts__panel--scores">
      <figcaption class="mediaLogCharts__caption">
        Scores <span class="mediaLogCharts__captionNote">{stats.rated} of {stats.total} rated</span>
      </figcaption>
      <div class="mediaLogCharts__chart">
        {@render pie('score', scoreData, (d) => `scored ${d.label}`)}
      </div>
    </figure>
  </div>
</div>

<style>
  /* The layout follows the component's own width, not the viewport: the
     site's sidebar makes the two differ by a few hundred pixels. */
  .mediaLogCharts {
    container-type: inline-size;
  }

  /* Four equal columns on the same gap as the stat tiles above, so panel
     edges line up with tile edges. */
  .mediaLogCharts__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-areas:
      'months months weekdays creators'
      'decades decades scores creators';
    gap: 0.75rem;
  }

  .mediaLogCharts__panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    margin: 0;
    padding: 0.5rem 0.75rem 0.75rem;
    border: 1px solid var(--visBg);
    font-family: var(--codeFont);
  }

  .mediaLogCharts__panel--months {
    grid-area: months;
  }

  .mediaLogCharts__panel--weekdays {
    grid-area: weekdays;
  }

  .mediaLogCharts__panel--creators {
    grid-area: creators;
  }

  .mediaLogCharts__panel--decades {
    grid-area: decades;
  }

  .mediaLogCharts__panel--scores {
    grid-area: scores;
  }

  .mediaLogCharts__caption {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--subtle);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .mediaLogCharts__captionNote {
    opacity: 0.7;
  }

  .mediaLogCharts__chart {
    position: relative;
    height: 13rem;
    font-size: 0.6875rem;
  }

  .mediaLogCharts__creators {
    list-style: none;
    margin: 0 -0.75rem;
    padding: 0;
  }

  .mediaLogCharts__creatorItem {
    margin: 0;
    padding: 0;
  }

  .mediaLogCharts__creator {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    text-align: left;
    font-family: var(--codeFont);
    font-size: 0.8125rem;
    color: var(--subtle);
    background: none;
    border: none;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
  }

  .mediaLogCharts__creator:hover {
    color: var(--fg);
  }

  .mediaLogCharts__creator:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: -2px;
  }

  .mediaLogCharts__creator--selected,
  .mediaLogCharts__creator--selected:hover {
    color: var(--bg);
    background: var(--fg);
  }

  .mediaLogCharts__creatorName {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mediaLogCharts__creatorCount {
    font-weight: 600;
  }

  /* LayerChart internals: CSS outranks its presentation attributes */
  .mediaLogCharts__chart :global(.lc-tooltip-context),
  .mediaLogCharts__chart :global(.mediaLogCharts__arc) {
    cursor: pointer;
  }

  .mediaLogCharts__chart :global(.lc-highlight-area) {
    fill: var(--fg);
    opacity: 0.12;
  }

  .mediaLogCharts__chart :global(.lc-axis-tick-label),
  .mediaLogCharts__chart :global(.lc-labels-text),
  .mediaLogCharts__chart :global(.lc-arc-label-text) {
    fill: var(--subtle);
    stroke: none;
    font-family: var(--codeFont);
    font-size: 0.625rem;
  }

  .mediaLogCharts__chart :global(.lc-arc-label-line) {
    stroke: var(--subtle);
    opacity: 0.5;
  }

  @container (max-width: 1000px) {
    .mediaLogCharts__grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        'months decades'
        'weekdays scores'
        'creators creators';
    }
  }

  @container (max-width: 560px) {
    .mediaLogCharts__grid {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'months'
        'decades'
        'weekdays'
        'scores'
        'creators';
    }
  }
</style>
