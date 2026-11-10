<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import Button from '#lib/components/Button/Button.svelte';
  import StarRating from '#lib/components/StarRating/StarRating.svelte';
  import { cfImage, cfImageSrcset } from '#lib/utils/image.js';
  import { USER_TIMEZONE } from '#lib/utils/timezone.js';
  import { onMount } from 'svelte';
  import MediaLogCharts from './MediaLogCharts.svelte';
  import {
    computeStats,
    matchesFilter,
    searchItems,
    sortItems,
    type MediaLogFilter,
    type MediaLogSort
  } from './stats.js';
  import { MEDIA_LOG_LABELS, type MediaLogItem, type MediaLogKind, type MediaLogResponse } from './types.js';

  // Stats, charts and a searchable grid over everything logged for one kind
  // (movies today). The post's load puts the log in page data so the first
  // render happens on the server; without it the component fetches on mount.
  // `?m=<id>` deep-links to one review.
  interface Props {
    kind: MediaLogKind;
  }

  let { kind }: Props = $props();

  let labels = $derived(MEDIA_LOG_LABELS[kind]);

  function preloaded(): MediaLogItem[] | null {
    const data = (page.data as { mediaLog?: MediaLogResponse | null }).mediaLog;
    return data?.kind === kind ? data.items : null;
  }

  const initial = preloaded();
  let items = $state.raw<MediaLogItem[]>(initial ?? []);
  let loading = $state(initial === null);
  let error = $state<string | null>(null);

  let sort = $state<MediaLogSort>('date');
  let term = $state('');
  let reviewedOnly = $state(false);
  let filter = $state<MediaLogFilter | null>(null);
  let selectedId = $state<number | null>(null);
  let dialogEl = $state<HTMLDialogElement | null>(null);

  const nowSec = Math.floor(Date.now() / 1000);
  let stats = $derived(computeStats(items, nowSec));

  let visible = $derived.by(() => {
    let list = items;
    if (reviewedOnly) list = list.filter((item) => item.review);
    const active = filter;
    if (active) list = list.filter((item) => matchesFilter(item, active));
    return sortItems(searchItems(list, term), sort);
  });

  // Prev/next walk the grid as currently sorted and filtered. A deep-linked
  // item outside the current filter still opens; it just has no neighbours.
  let selected = $derived(selectedId == null ? null : (items.find((item) => item.id === selectedId) ?? null));
  let selectedIndex = $derived(selected ? visible.indexOf(selected) : -1);
  let prev = $derived(selectedIndex > 0 ? visible[selectedIndex - 1] : null);
  let next = $derived(selectedIndex >= 0 && selectedIndex < visible.length - 1 ? visible[selectedIndex + 1] : null);

  onMount(async () => {
    if (initial === null) {
      try {
        const response = await fetch(`/api/activity/log/${kind}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${labels.nounPlural}`);
        }
        items = ((await response.json()) as MediaLogResponse).items;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error';
      } finally {
        loading = false;
      }
    }
    const linked = Number(new URL(window.location.href).searchParams.get('m'));
    if (items.some((item) => item.id === linked)) selectedId = linked;
  });

  // The dialog element is the modal; state decides whether it is open.
  $effect(() => {
    if (!dialogEl) return;
    if (selected && !dialogEl.open) dialogEl.showModal();
    else if (!selected && dialogEl.open) dialogEl.close();
  });

  function select(id: number | null) {
    selectedId = id;
    const url = new URL(window.location.href);
    if (id == null) url.searchParams.delete('m');
    else url.searchParams.set('m', String(id));
    replaceState(url, page.state);
  }

  function toggleFilter(picked: MediaLogFilter) {
    filter = filter?.dimension === picked.dimension && filter.key === picked.key ? null : picked;
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' && prev) select(prev.id);
    else if (event.key === 'ArrowRight' && next) select(next.id);
  }

  // A click on the backdrop lands on the dialog element itself
  function handleDialogClick(event: MouseEvent) {
    if (event.target === dialogEl) select(null);
  }

  const dateFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: USER_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  function formatDate(timestamp: number): string {
    return dateFormat.format(new Date(timestamp * 1000));
  }

  const POSTER_WIDTHS = [160, 240, 320, 480];
</script>

<section class="mediaLog">
  {#if loading}
    <div class="mediaLog__notice">Loading {labels.nounPlural}...</div>
  {:else if error}
    <div class="mediaLog__notice">{error}</div>
  {:else if items.length === 0}
    <div class="mediaLog__notice">No {labels.nounPlural} logged yet.</div>
  {:else}
    <div class="mediaLog__stats">
      <div class="mediaLog__stat">
        <span class="mediaLog__statValue">{stats.lastYear}</span>
        <span class="mediaLog__statLabel">{labels.consumed} in the last 365 days</span>
      </div>
      <div class="mediaLog__stat">
        <span class="mediaLog__statValue">{stats.reviewed}</span>
        <span class="mediaLog__statLabel">{stats.reviewed === 1 ? 'review' : 'reviews'} written</span>
      </div>
      <div class="mediaLog__stat">
        <span class="mediaLog__statValue">{stats.averageScore?.toFixed(1) ?? '—'}</span>
        <span class="mediaLog__statLabel">average score out of 5</span>
      </div>
      <div class="mediaLog__stat">
        <span class="mediaLog__statValue">{stats.topWeekday?.label ?? '—'}</span>
        <span class="mediaLog__statLabel">favorite {labels.noun} night</span>
      </div>
    </div>

    <MediaLogCharts {stats} {labels} {filter} onFilter={toggleFilter} />

    <div class="mediaLog__toolbar">
      <input
        class="mediaLog__search"
        type="search"
        placeholder="Search {labels.nounPlural}"
        aria-label="Search {labels.nounPlural}"
        bind:value={term}
      />
      <label class="mediaLog__control">
        <span class="mediaLog__controlLabel">Sort</span>
        <select bind:value={sort}>
          <option value="date">{labels.dateSort}</option>
          <option value="year">{labels.yearSort}</option>
          <option value="score">Score</option>
        </select>
      </label>
      <label class="mediaLog__control">
        <input type="checkbox" bind:checked={reviewedOnly} />
        <span class="mediaLog__controlLabel">Reviewed only</span>
      </label>
      {#if filter}
        <button class="mediaLog__chip" type="button" onclick={() => (filter = null)}>
          {filter.label}
          <span aria-hidden="true">×</span>
          <span class="mediaLog__srOnly">Clear filter</span>
        </button>
      {/if}
      <span class="mediaLog__count">
        {visible.length === items.length ? visible.length : `${visible.length} of ${items.length}`}
        {items.length === 1 ? labels.noun : labels.nounPlural}
      </span>
    </div>

    {#if visible.length === 0}
      <div class="mediaLog__notice">No {labels.nounPlural} match.</div>
    {:else}
      <!-- divs with list roles rather than ul/li: posts style every `ul`
           (left padding) and `ul li::marker` (a ❖), and both outrank a
           scoped class here. -->
      <div class="mediaLog__grid" role="list">
        {#each visible as item (item.id)}
          <div class="mediaLog__gridItem" role="listitem">
            <button class="mediaLog__card" type="button" onclick={() => select(item.id)}>
              <span class="mediaLog__poster">
                {#if item.imageUrl}
                  <img
                    class="mediaLog__posterImage"
                    src={cfImage(item.imageUrl, { w: 320 })}
                    srcset={cfImageSrcset(item.imageUrl, POSTER_WIDTHS)}
                    sizes="(max-width: 600px) 30vw, 150px"
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                {:else}
                  <span class="mediaLog__posterFallback">{item.title}</span>
                {/if}
                {#if item.review}
                  <span class="mediaLog__badge">Review</span>
                {/if}
              </span>
              <span class="mediaLog__cardMeta">
                {#if item.year}{item.year}{/if}
                {#if item.rating}
                  <span class="mediaLog__cardStars" aria-label="{item.rating} out of 5">
                    {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                  </span>
                {/if}
              </span>
              <span class="mediaLog__cardTitle">{item.title}</span>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <dialog
    class="mediaLog__dialog"
    bind:this={dialogEl}
    onclose={() => selectedId != null && select(null)}
    onclick={handleDialogClick}
    onkeydown={handleDialogKeydown}
  >
    {#if selected}
      <div class="mediaLog__detail">
        {#if selected.imageUrl}
          <img class="mediaLog__detailPoster" src={cfImage(selected.imageUrl, { w: 480 })} alt="" />
        {/if}
        <div class="mediaLog__detailBody">
          <h3 class="mediaLog__detailTitle">
            {selected.title}{#if selected.year}&nbsp;({selected.year}){/if}
          </h3>
          <div class="mediaLog__detailMeta">
            {#if selected.creators.length > 0}
              <span>by {selected.creators.join(', ')}</span>
            {/if}
            <span>{labels.consumed} {formatDate(selected.timestamp)}</span>
          </div>
          {#if selected.rating}
            <StarRating rating={selected.rating} />
          {/if}
          {#if selected.review}
            <div class="mediaLog__review">{selected.review}</div>
          {:else}
            <div class="mediaLog__review mediaLog__review--empty">No review written for this one.</div>
          {/if}
        </div>
      </div>
      <div class="mediaLog__detailNav">
        <Button size="sm" disabled={!prev} onclick={() => prev && select(prev.id)}>← Prev</Button>
        <Button size="sm" disabled={!next} onclick={() => next && select(next.id)}>Next →</Button>
        <span class="mediaLog__detailSpacer"></span>
        {#if selected.link}
          <a class="mediaLog__detailLink" href={selected.link} target="_blank" rel="noopener noreferrer">
            {labels.linkLabel} ↗
          </a>
        {/if}
        <Button size="sm" onclick={() => select(null)}>Close</Button>
      </div>
    {/if}
  </dialog>
</section>

<style>
  .mediaLog {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 1rem;
  }

  .mediaLog__notice {
    text-align: center;
    padding: 2rem;
    color: var(--subtle);
    font-family: var(--codeFont);
    font-size: 0.875rem;
  }

  .mediaLog__stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .mediaLog__stat {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--visBg);
    font-family: var(--codeFont);
  }

  .mediaLog__statValue {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--fg);
  }

  .mediaLog__statLabel {
    color: var(--subtle);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .mediaLog__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.25rem;
    margin-top: 2rem;
    font-family: var(--codeFont);
    font-size: 0.8125rem;
  }

  .mediaLog__search {
    flex: 1 1 14rem;
    max-width: 22rem;
  }

  .mediaLog__control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .mediaLog__controlLabel,
  .mediaLog__count {
    color: var(--subtle);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .mediaLog__count {
    margin-left: auto;
  }

  .mediaLog__chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font: inherit;
    color: var(--bg);
    background: var(--fg);
    border: none;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }

  .mediaLog__chip:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
  }

  .mediaLog__srOnly {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .mediaLog__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 1.5rem 1rem;
  }

  .mediaLog__gridItem {
    min-width: 0;
  }

  .mediaLog__card {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    text-align: left;
    font-family: var(--codeFont);
    color: var(--subtle);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .mediaLog__card:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: 4px;
  }

  .mediaLog__poster {
    position: relative;
    display: block;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    background: var(--visBg);
    outline: 1px solid var(--visBg);
  }

  .mediaLog__card:hover .mediaLog__poster {
    outline: 2px solid var(--fg);
  }

  .mediaLog__posterImage {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mediaLog__posterFallback {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    text-align: center;
    font-size: 0.75rem;
  }

  .mediaLog__badge {
    position: absolute;
    left: 0;
    bottom: 0;
    padding: 0.15rem 0.4rem;
    color: var(--bg);
    background: var(--fg);
    font-size: 0.5625rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .mediaLog__cardTitle {
    color: var(--fg);
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.3;
  }

  /* Directly under the poster so it lines up across a row; the title goes
     last, where a second line costs nothing. */
  .mediaLog__cardMeta {
    margin-top: 0.25rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 0.5rem;
    font-size: 0.6875rem;
  }

  .mediaLog__cardStars {
    letter-spacing: 0.05em;
  }

  .mediaLog__dialog {
    width: min(52rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    margin: auto;
    padding: 0;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--visBg);
    overflow: hidden;
  }

  .mediaLog__dialog[open] {
    display: flex;
    flex-direction: column;
  }

  .mediaLog__dialog::backdrop {
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    backdrop-filter: blur(2px);
  }

  .mediaLog__detail {
    display: flex;
    align-items: flex-start;
    gap: 1.5rem;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .mediaLog__detailPoster {
    width: 14rem;
    height: auto;
    flex-shrink: 0;
    position: sticky;
    top: 0;
  }

  .mediaLog__detailBody {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .mediaLog__detailTitle {
    margin: 0;
    font-size: 1.75rem;
    line-height: 1.15;
  }

  .mediaLog__detailMeta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    color: var(--subtle);
    font-family: var(--codeFont);
    font-size: 0.75rem;
  }

  .mediaLog__review {
    margin-top: 0.5rem;
    line-height: 1.6;
    color: var(--fg);
    font-size: 1rem;
    white-space: pre-line;
  }

  .mediaLog__review--empty {
    color: var(--subtle);
    font-style: italic;
  }

  .mediaLog__detailNav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-top: 1px solid var(--visBg);
    font-family: var(--codeFont);
    font-size: 0.75rem;
  }

  .mediaLog__detailSpacer {
    flex: 1;
  }

  .mediaLog__detailLink {
    color: var(--subtle);
    margin-right: 0.5rem;
  }

  .mediaLog__detailLink:hover {
    color: var(--fg);
  }

  @media (max-width: 768px) {
    .mediaLog__stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .mediaLog__grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1rem 0.75rem;
    }

    .mediaLog__count {
      margin-left: 0;
    }

    .mediaLog__detail {
      display: block;
      padding: 1rem;
    }

    .mediaLog__detailPoster {
      position: static;
      float: left;
      width: 6rem;
      margin-right: 1rem;
    }

    /* A plain block, so its text wraps the floated poster and the review
       can clear it */
    .mediaLog__detailBody {
      display: block;
    }

    .mediaLog__detailTitle {
      font-size: 1.25rem;
    }

    .mediaLog__detailMeta {
      margin-top: 0.5rem;
    }

    .mediaLog__review {
      clear: both;
      padding-top: 0.75rem;
    }

    .mediaLog__detailNav {
      padding: 0.75rem 1rem;
    }
  }
</style>
