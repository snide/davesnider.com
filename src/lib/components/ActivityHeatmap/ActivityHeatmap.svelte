<script lang="ts">
  type HeatmapRow = { type: string; counts: number[] };

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

  let dayList = $state<string[]>([]);
  let rows = $state<HeatmapRow[]>([]);

  async function fetchHeatmap() {
    const response = await fetch(`/api/activity/heatmap?days=${days}&tzOffset=${new Date().getTimezoneOffset()}`);
    const result = await response.json();
    // Newest day at the top, matching the feed's default sort
    dayList = result.days.reverse();
    rows = result.rows.map((row: HeatmapRow) => ({ ...row, counts: row.counts.reverse() }));
  }

  $effect(() => {
    void days;
    fetchHeatmap();
  });

  function formatDay(day: string): string {
    return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatMonth(day: string): string {
    return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
  }

  // ISO dates compare correctly as strings
  function isOutsideDateFilter(day: string): boolean {
    if (startDate && day < startDate) return true;
    if (endDate && day > endDate) return true;
    return false;
  }

  function isMuted(type: string, day: string): boolean {
    if (activeType && type !== activeType) return true;
    return isOutsideDateFilter(day);
  }

  function cellLabel(type: string, count: number, day: string): string {
    const noun = type === 'plex' || type === 'steam' || type === 'bgg' ? 'play' : type === 'github' ? 'update' : 'post';
    return `${count} ${type} ${count === 1 ? noun : `${noun}s`} on ${formatDay(day)}`;
  }
</script>

<div class="activityHeatmap" style="--heatmapDays: {dayList.length || days}">
  <div class="activityHeatmap__column">
    <span class="activityHeatmap__label"></span>
    <div class="activityHeatmap__cells">
      {#each dayList as day, i (day)}
        {@const isEdge = i === 0 || i === dayList.length - 1}
        {@const isMonthStart = day.endsWith('-01')}
        {@const isSelected = day === startDate || day === endDate}
        <div class="activityHeatmap__dateRow">
          {#if isSelected}
            <button class="activityHeatmap__clear" title="Clear filters" onclick={() => handleClear?.()}>
              &times;
            </button>
          {/if}
          <button
            class="activityHeatmap__dateCell"
            class:activityHeatmap__dateCell--active={day === dateInView}
            class:activityHeatmap__dateCell--muted={isOutsideDateFilter(day)}
            class:activityHeatmap__dateCell--selected={isSelected}
            onclick={() => handleClick?.(null, day)}
          >
            <span
              class="activityHeatmap__dateLabel"
              class:activityHeatmap__dateLabel--pinned={isEdge || isMonthStart || isSelected}
              class:activityHeatmap__dateLabel--selected={isSelected}
            >
              {isEdge || isSelected ? formatDay(day) : formatMonth(day)}
            </span>
            <span class="activityHeatmap__dateMarker">{formatDay(day)}</span>
          </button>
        </div>
      {/each}
    </div>
  </div>

  {#each rows as row (row.type)}
    {@const rowMax = Math.max(...row.counts, 1)}
    <div class="activityHeatmap__column">
      <span class="activityHeatmap__label">
        <span class="activityHeatmap__labelText" class:activityHeatmap__labelText--active={row.type === activeType}>
          {row.type}
        </span>
      </span>
      <div class="activityHeatmap__cells">
        {#each row.counts as count, i (dayList[i])}
          <button
            class="activityHeatmap__cell"
            class:activityHeatmap__cell--empty={count === 0}
            class:activityHeatmap__cell--muted={isMuted(row.type, dayList[i])}
            style={count > 0
              ? `--dotScale: ${(0.35 + (0.65 * count) / rowMax).toFixed(2)}; --dotMix: ${Math.round(25 + (75 * count) / rowMax)}%`
              : ''}
            title={cellLabel(row.type, count, dayList[i])}
            disabled={count === 0}
            onclick={() => handleClick?.(row.type, dayList[i])}
            aria-label={cellLabel(row.type, count, dayList[i])}
          >
            <span class="activityHeatmap__dot" class:activityHeatmap__dot--empty={count === 0}></span>
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .activityHeatmap {
    --heatmapBase: #222;
    --heatmapActive: #fff;
    --heatmapWidth: 11px;
    /* Largest circle that fits both the column width and a day row's height
       (98vh minus the label area, split across the day count) */
    --dotMax: min(var(--heatmapWidth), calc((98vh - 4.5rem) / var(--heatmapDays, 90) - 2px));
    position: fixed;
    top: 1vh;
    right: 0.5rem;
    height: 98vh;
    display: flex;
    gap: 3px;
  }

  .activityHeatmap__column {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .activityHeatmap__label {
    position: relative;
    height: 4rem;
    margin-bottom: 0.5rem;
  }

  .activityHeatmap__labelText {
    position: absolute;
    bottom: 0;
    right: 0;
    writing-mode: vertical-rl;
    white-space: nowrap;
    font-family: var(--codeFont);
    font-size: 0.6rem;
    text-transform: uppercase;
    color: var(--subtle);
  }

  .activityHeatmap__labelText--active {
    color: var(--fg);
    font-weight: bold;
  }

  .activityHeatmap__cells {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 2px;
  }

  .activityHeatmap__cell {
    width: var(--heatmapWidth);
    flex: 1 1 0;
    min-height: 2px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .activityHeatmap__cell--empty {
    cursor: default;
  }

  .activityHeatmap__cell--muted {
    opacity: 0.25;
  }

  /* Size and brightness both scale with the day's activity count; sized
     explicitly so it's always a true square regardless of how the row flexes */
  .activityHeatmap__dot {
    width: calc(var(--dotMax) * var(--dotScale, 1));
    height: calc(var(--dotMax) * var(--dotScale, 1));
    border-radius: 1px;
    background: color-mix(in srgb, var(--heatmapActive) var(--dotMix, 100%), var(--heatmapBase));
  }

  .activityHeatmap__dot--empty {
    width: 3px;
    height: 3px;
    background: var(--heatmapBase);
  }

  .activityHeatmap__dateRow {
    flex: 1 1 0;
    min-height: 2px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .activityHeatmap__dateCell {
    height: 100%;
    padding: 0 0.5rem 0 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    position: relative;
  }

  .activityHeatmap__clear {
    border: none;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--codeFont);
    font-size: 0.7rem;
    line-height: 1;
    padding: 0.1rem 0.25rem;
    margin-right: 0.25rem;
    cursor: pointer;
    position: relative;
    z-index: 2;
  }

  .activityHeatmap__dateLabel {
    visibility: hidden;
    white-space: nowrap;
    font-family: var(--codeFont);
    font-size: 0.6rem;
    text-transform: uppercase;
    color: var(--subtle);
  }

  .activityHeatmap__dateLabel--pinned {
    visibility: visible;
  }

  .activityHeatmap__dateLabel--selected {
    background: var(--bg);
    border: 1px solid var(--fg);
    color: var(--fg);
    padding: 0.1rem 0.2rem;
    position: relative;
    z-index: 2;
  }

  .activityHeatmap__dateMarker {
    visibility: hidden;
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    font-family: var(--codeFont);
    font-size: 0.6rem;
    text-transform: uppercase;
    background-color: var(--bg);
    color: var(--fg);
    border: 1px solid var(--fg);
    padding: 0.1rem 0.2rem;
    z-index: 1;
  }

  .activityHeatmap__dateCell--muted .activityHeatmap__dateLabel {
    opacity: 0.25;
  }

  .activityHeatmap__dateCell:hover .activityHeatmap__dateLabel,
  .activityHeatmap__dateCell--active .activityHeatmap__dateLabel {
    visibility: hidden;
  }

  .activityHeatmap__dateCell:hover .activityHeatmap__dateMarker,
  .activityHeatmap__dateCell--active .activityHeatmap__dateMarker {
    visibility: visible;
  }

  /* The selected row's chip already shows the full date; swapping it for the
     hover marker only causes a visual jump */
  .activityHeatmap__dateCell--selected .activityHeatmap__dateLabel {
    visibility: visible;
  }

  .activityHeatmap__dateCell--selected .activityHeatmap__dateMarker {
    visibility: hidden;
  }

  @media (max-width: 768px) {
    .activityHeatmap {
      display: none;
    }
  }
</style>
