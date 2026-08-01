<script lang="ts">
  import { RAIL_MONO_MIX, toCompositions, type DayComposition } from './palette';
  import {
    RAIL_GRID_CELLS,
    cellLabel,
    formatDay,
    formatMonth,
    isOutsideDateFilter,
    quantizeSegments
  } from './railShared';
  import RailTooltip from './RailTooltip.svelte';

  type Props = {
    days?: number;
    activeType?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    dateInView?: string | null;
    handleClick?: (type: string | null, date: string) => void;
    handleClear?: () => void;
  };

  let {
    days = 90,
    activeType = null,
    startDate = null,
    endDate = null,
    dateInView = null,
    handleClick,
    handleClear
  }: Props = $props();

  let compositions = $state<DayComposition[]>([]);

  async function fetchHeatmap() {
    try {
      const response = await fetch(`/api/activity/heatmap?days=${days}&tzOffset=${new Date().getTimezoneOffset()}`);
      if (!response.ok) return;
      const result = await response.json();
      // Newest day at the top, matching the feed's default sort
      compositions = toCompositions(result.days, result.rows).reverse();
    } catch {
      // Silent failure leaves the rail empty
    }
  }

  $effect(() => {
    void days;
    fetchHeatmap();
  });

  let hasDateFilter = $derived(Boolean(startDate || endDate));

  // Row height encodes the day's relative volume (sqrt-scaled to tame
  // outliers), floored so quiet days stay clickable and empty days keep
  // their dot.
  const MIN_ROW_WEIGHT = 0.3;
  let rowWeights = $derived.by(() => {
    const max = Math.max(...compositions.map((c) => c.total), 1);
    return compositions.map((c) =>
      c.total === 0 ? MIN_ROW_WEIGHT : MIN_ROW_WEIGHT + (1 - MIN_ROW_WEIGHT) * Math.sqrt(c.total / max)
    );
  });

  function isInDateFilter(day: string): boolean {
    return hasDateFilter && !isOutsideDateFilter(day, startDate, endDate);
  }

  // Hovered-day tooltip state (a single RailTooltip floats left of the rail)
  let railEl = $state<HTMLElement | null>(null);
  let hoveredComp = $state<DayComposition | null>(null);
  let hoveredAnchor = $state<HTMLElement | null>(null);

  function showTooltip(comp: DayComposition, event: MouseEvent | FocusEvent) {
    hoveredComp = comp;
    hoveredAnchor = event.currentTarget as HTMLElement;
  }

  function hideTooltip() {
    hoveredComp = null;
    hoveredAnchor = null;
  }
</script>

<div class="activityRibbon" bind:this={railEl}>
  <div class="activityRibbon__column">
    <span class="activityRibbon__spacer">
      {#if hasDateFilter}
        <button class="activityRibbon__clear" title="Clear filters" onclick={() => handleClear?.()}>&times;</button>
      {/if}
    </span>
    <div class="activityRibbon__rows">
      {#each compositions as comp, i (comp.day)}
        {@const segments = quantizeSegments(comp)}
        {@const cellsUsed = segments.reduce((sum, seg) => sum + seg.cells, 0)}
        <div
          class="activityRibbon__row"
          style="flex: {rowWeights[i]} 1 0%"
          class:activityRibbon__row--highlighted={isInDateFilter(comp.day)}
          class:activityRibbon__row--muted={isOutsideDateFilter(comp.day, startDate, endDate)}
          class:activityRibbon__row--inView={comp.day === dateInView}
          role="button"
          tabindex="0"
          aria-label={`${formatDay(comp.day)} — ${comp.total} ${comp.total === 1 ? 'event' : 'events'}. Filter to this day.`}
          onclick={() => handleClick?.(null, comp.day)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick?.(null, comp.day);
            }
          }}
          onmouseenter={(e) => showTooltip(comp, e)}
          onmouseleave={hideTooltip}
          onfocus={(e) => showTooltip(comp, e)}
          onblur={hideTooltip}
        >
          {#if comp.day.endsWith('-01')}
            <span class="activityRibbon__monthLabel" aria-hidden="true">{formatMonth(comp.day)}</span>
          {/if}
          {#if segments.length === 0}
            <span class="activityRibbon__emptyDot"></span>
          {:else}
            {#each segments as seg (seg.type)}
              <button
                class="activityRibbon__segment"
                class:activityRibbon__segment--muted={activeType !== null && seg.type !== activeType}
                style="--segmentMix: {RAIL_MONO_MIX[seg.type]}; flex: {seg.cells} 1 0%"
                tabindex="-1"
                aria-label={cellLabel(seg.type, seg.count, comp.day)}
                onclick={(e) => {
                  e.stopPropagation();
                  handleClick?.(seg.type, comp.day);
                }}
              ></button>
            {/each}
            {#if cellsUsed < RAIL_GRID_CELLS}
              <span
                class="activityRibbon__filler"
                style="flex: {RAIL_GRID_CELLS - cellsUsed} 1 0%"
                aria-hidden="true"
              ></span>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<RailTooltip comp={hoveredComp} anchor={hoveredAnchor} rail={railEl} />

<style>
  .activityRibbon {
    position: fixed;
    top: 1vh;
    right: 0.5rem;
    height: 98vh;
    display: flex;
    gap: 3px;
  }

  .activityRibbon__column {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 36px;
  }

  .activityRibbon__spacer {
    height: 4rem;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
  }

  .activityRibbon__clear {
    border: 1px solid var(--fg);
    background: var(--bg);
    color: var(--fg);
    font-family: var(--codeFont);
    font-size: 0.7rem;
    line-height: 1;
    padding: 0.1rem 0.25rem;
    cursor: pointer;
  }

  .activityRibbon__rows {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 1px;
  }

  .activityRibbon__row {
    position: relative;
    flex: 1 1 0;
    min-height: 2px;
    display: flex;
    gap: 1px;
    align-items: stretch;
    cursor: pointer;
  }

  .activityRibbon__row--muted {
    opacity: 0.3;
  }

  /* Keyboard focus mirrors hover: ring in the gutter, full-strength segments */
  .activityRibbon__row:focus-visible {
    outline: 1px solid var(--fg);
    outline-offset: 1px;
  }

  .activityRibbon__row:focus-visible .activityRibbon__segment {
    background: color-mix(in srgb, var(--fg) calc(var(--segmentMix) * 1%), var(--bg));
  }

  /* Static month signifier at each month boundary — label only, no button */
  .activityRibbon__monthLabel {
    position: absolute;
    right: calc(100% + 0.4rem);
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--codeFont);
    font-size: 0.6rem;
    text-transform: uppercase;
    color: var(--subtle);
    white-space: nowrap;
    pointer-events: none;
  }

  /* Reading-position marker: painted in the gutter so nothing shifts */
  .activityRibbon__row--inView::before {
    content: '';
    position: absolute;
    left: -3px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--fg);
  }

  .activityRibbon__segment {
    padding: 0;
    border: none;
    min-width: 0;
    cursor: pointer;
    /* Monochrome: each type is a grayscale step (--segmentMix % of --fg),
       rested at 60% strength so the rail stays ambient */
    background: color-mix(in srgb, var(--fg) calc(var(--segmentMix) * 0.6%), var(--bg));
  }

  .activityRibbon__row:hover .activityRibbon__segment,
  .activityRibbon__row--highlighted .activityRibbon__segment {
    background: color-mix(in srgb, var(--fg) calc(var(--segmentMix) * 1%), var(--bg));
  }

  .activityRibbon__row .activityRibbon__segment--muted,
  .activityRibbon__row:hover .activityRibbon__segment--muted {
    background: color-mix(in srgb, var(--fg) 12%, var(--bg));
  }

  .activityRibbon__filler {
    pointer-events: none;
  }

  .activityRibbon__emptyDot {
    width: 2px;
    height: 2px;
    margin: auto;
    background: color-mix(in srgb, var(--fg) 10%, var(--bg));
  }

  @media (max-width: 768px) {
    .activityRibbon {
      display: none;
    }
  }
</style>
