<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import type { PageData } from './$types';
  import type {
    SelectActivityHackernews,
    SelectActivityPlex,
    SelectActivityGithub,
    SelectActivityBluesky,
    SelectActivityReddit,
    SelectActivityBgg,
    SelectActivitySteam,
    BlueskyThreadPost,
    SelectBlueskyAuthor
  } from '$db/schema';
  import {
    ActivityItemPlex,
    ActivityItemGithub,
    ActivityItemBluesky,
    ActivityItemHackernews,
    ActivityItemReddit,
    ActivityItemBgg,
    ActivityItemSteam
  } from '$lib/components/ActivityItem';
  import ActivityHeatmap from '$lib/components/ActivityHeatmap/ActivityHeatmap.svelte';
  import Button from '$lib/components/Button/Button.svelte';
  import Loader from '$lib/components/StlViewer/Loader.svelte';
  import { mode } from 'mode-watcher';
  import { animate } from '$lib/actions/animate';

  let { data }: { data: PageData } = $props();

  type ActivityWithDetails = {
    id: number;
    type: string;
    externalId: string;
    timestamp: number;
    isPrivate: boolean;
    createdAt: Date;
    details: unknown;
    thread?: BlueskyThreadPost[];
    titleExcerpt?: string | null;
    bodyExcerpt?: string | null;
  };

  const activityTypes = ['all', 'plex', 'github', 'bluesky', 'hackernews', 'steam', 'bgg'];

  function typeLabel(type: string): string {
    if (type === 'all') return 'All services';
    if (type === 'bgg') return 'BGG';
    if (type === 'hackernews') return 'Hacker News';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  let filterPopoverIsOpen = $state(false);
  let typeFilter = $state(data.typeFilter || 'all');
  let sortOrder = $state<'asc' | 'desc'>((data.sortOrder as 'asc' | 'desc') || 'desc');
  let startDate = $state(data.startDate || '');
  let endDate = $state(data.endDate || '');
  let searchTerm = $state(data.searchTerm || '');
  let isSearching = $derived(searchTerm.trim() !== '');

  let activities = $state<ActivityWithDetails[]>(data.activities);
  let blueskyAuthors = $state<Record<string, SelectBlueskyAuthor>>(data.blueskyAuthors || {});
  let page = $state(1);
  let isLoading = $state(false);
  let hasMore = $state(data.activities.length === 20);

  let iconColor = $derived(mode.current === 'light' ? 'black' : 'white');
  let authorsMap = $derived(new Map(Object.entries(blueskyAuthors)));
  let dateInView = $state<string | null>(null);

  // Track the date of the topmost visible activity so the heatmap can mark it
  function updateDateInView() {
    const items = document.querySelectorAll<HTMLElement>('.activity__item');
    for (const item of items) {
      if (item.getBoundingClientRect().bottom > 100) {
        const timestamp = Number(item.dataset.timestamp);
        // en-CA formats as YYYY-MM-DD, matching the heatmap's day keys
        dateInView = timestamp ? new Date(timestamp * 1000).toLocaleDateString('en-CA') : null;
        return;
      }
    }
    dateInView = null;
  }

  function buildFetchUrl(pageNum: number) {
    const params = new URLSearchParams();
    params.set('page', String(pageNum));
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
    if (sortOrder === 'asc') params.set('sort', 'asc');
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (searchTerm.trim()) params.set('q', searchTerm.trim());
    return `/api/activity/list?${params.toString()}`;
  }

  async function fetchData() {
    if (isLoading || !hasMore) return;
    isLoading = true;

    try {
      const response = await fetch(buildFetchUrl(page));
      const result = await response.json();

      if (result.activities && result.activities.length > 0) {
        const existingIds = new Set(activities.map((a) => a.id));
        const newActivities = result.activities.filter((a: ActivityWithDetails) => !existingIds.has(a.id));
        activities = [...activities, ...newActivities];

        if (result.blueskyAuthors) {
          blueskyAuthors = { ...blueskyAuthors, ...result.blueskyAuthors };
        }

        hasMore = result.hasMore;
      } else {
        hasMore = false;
      }
    } catch {
      // Failed to fetch activities
    }

    isLoading = false;
    setTimeout(updateDateInView, 50);
  }

  function resetAndFetch() {
    activities = [];
    page = 1;
    hasMore = true;
    fetchData();
  }

  function buildFilterUrl() {
    const params = new URLSearchParams();
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
    if (sortOrder === 'asc') params.set('sort', 'asc');
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (searchTerm.trim()) params.set('q', searchTerm.trim());
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '/activity';
  }

  function applyFilters() {
    const newUrl = buildFilterUrl();
    replaceState(newUrl, {});
    resetAndFetch();
  }

  let searchDebounce: ReturnType<typeof setTimeout>;
  function handleSearchInput() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => applyFilters(), 500);
  }

  function handleHeatmapClick(type: string | null, date: string) {
    if (type) {
      typeFilter = type;
    }
    startDate = date;
    endDate = date;
    filterPopoverIsOpen = true;
    applyFilters();
  }

  function handleHeatmapClear() {
    typeFilter = 'all';
    startDate = '';
    endDate = '';
    applyFilters();
  }

  // Search excerpts arrive with \u0001/\u0002 wrapping matched terms; split
  // them into segments so highlights render as elements, never as HTML.
  function parseExcerpt(excerpt: string): { text: string; hl: boolean }[] {
    const [first, ...rest] = excerpt.split('\u0001');
    const segments: { text: string; hl: boolean }[] = first ? [{ text: first, hl: false }] : [];
    for (const chunk of rest) {
      const markEnd = chunk.indexOf('\u0002');
      if (markEnd === -1) {
        segments.push({ text: chunk, hl: true });
      } else {
        segments.push({ text: chunk.slice(0, markEnd), hl: true });
        if (chunk.length > markEnd + 1) {
          segments.push({ text: chunk.slice(markEnd + 1), hl: false });
        }
      }
    }
    return segments;
  }

  function pickExcerpt(activity: ActivityWithDetails): string | null {
    if (activity.bodyExcerpt?.includes('\u0001')) return activity.bodyExcerpt;
    if (activity.titleExcerpt?.includes('\u0001')) return activity.titleExcerpt;
    return null;
  }

  let scrollDebounce: ReturnType<typeof setTimeout>;
  function handleScroll() {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      updateDateInView();
      if (hasMore && !isLoading) {
        const scrollBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000;
        if (scrollBottom) {
          page++;
          fetchData();
        }
      }
    }, 100);
  }

  function getTypeIcon(type: string, color: string): string {
    const base = 'https://cdn.simpleicons.org';
    switch (type) {
      case 'plex':
        return `${base}/plex/${color}`;
      case 'github':
        return `${base}/github/${color}`;
      case 'bluesky':
        return `${base}/bluesky/${color}`;
      case 'reddit':
        return `${base}/reddit/${color}`;
      case 'hackernews':
        return `${base}/ycombinator/${color}`;
      case 'bgg':
        return `${base}/boardgamegeek/${color}`;
      case 'steam':
        return `${base}/steam/${color}`;
      default:
        return `${base}/github/${color}`;
    }
  }

  async function clearType(type: string) {
    if (!confirm(`Delete all ${type} activity?`)) return;

    const response = await fetch(`/api/activity/clear/${type}`, { method: 'DELETE' });
    if (response.ok) {
      const result = await response.json();
      alert(`Deleted ${result.deleted} items`);
      resetAndFetch();
    }
  }

  function hideActivity(id: number, title: string | null | undefined) {
    if (!confirm(`Hide "${title || 'this item'}"?`)) return;

    fetch(`/api/activity/${id}`, { method: 'DELETE' }).then((response) => {
      if (response.ok) {
        activities = activities.filter((a) => a.id !== id);
      }
    });
  }

  onMount(() => {
    window.addEventListener('scroll', handleScroll);
    updateDateInView();
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });
</script>

<svelte:head>
  <title>Activity - Dave Snider</title>
  <meta name="description" content="What I'm watching, coding, reading, and posting across the web." />
  <meta property="og:title" content="Activity - Dave Snider" />
  <meta property="og:description" content="What I'm watching, coding, reading, and posting across the web." />
  <meta property="og:image" content="https://davesnider.com/og.png" />
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="activity" class:activity--withViz={!isSearching}>
  <div class="activity__header">
    <div class="activity__titleRow">
      <div class="activity__title">
        <h1>Activity</h1>
        {#if isLoading}
          <Loader />
        {/if}
      </div>
      <div class="activity__headerRight">
        {#if data.isAdmin}
          <Button href="/activity/add">+</Button>
        {/if}
        <input
          class="activity__search"
          type="search"
          placeholder="Search"
          bind:value={searchTerm}
          oninput={handleSearchInput}
        />
        <Button onclick={() => (filterPopoverIsOpen = !filterPopoverIsOpen)}>
          {filterPopoverIsOpen ? 'Hide' : 'Show'} filters
        </Button>
      </div>
    </div>

    {#if filterPopoverIsOpen}
      <div class="activity__filterPopover">
        <input type="date" bind:value={startDate} onchange={applyFilters} />
        <span class="activity__filterArrow">&rarr;</span>
        <input type="date" bind:value={endDate} onchange={applyFilters} />

        <select bind:value={sortOrder} onchange={applyFilters}>
          <option value="desc">New to Old</option>
          <option value="asc">Old to New</option>
        </select>

        <select bind:value={typeFilter} onchange={applyFilters}>
          {#each activityTypes as type}
            <option value={type}>
              {typeLabel(type)}
            </option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  {#if !isSearching}
    <ActivityHeatmap
      handleClick={handleHeatmapClick}
      handleClear={handleHeatmapClear}
      activeType={typeFilter !== 'all' ? typeFilter : null}
      startDate={startDate || null}
      endDate={endDate || null}
      {dateInView}
    />
  {/if}

  {#if activities.length === 0 && !isLoading}
    <p class="activity__empty">No activity found</p>
  {:else}
    <div class="activity__list">
      {#each activities as activity (activity.id)}
        <div use:animate class="activity__item" data-timestamp={activity.timestamp}>
          {#if activity.type === 'plex'}
            {@const details = activity.details as SelectActivityPlex}
            <ActivityItemPlex
              activityId={activity.id}
              {details}
              timestamp={activity.timestamp}
              isPrivate={activity.isPrivate}
              isAdmin={data.isAdmin}
              onHide={() => hideActivity(activity.id, details?.title)}
              onUpdate={(rating, review) => {
                if (details) {
                  details.rating = rating;
                  details.review = review;
                }
              }}
            />
          {:else if activity.type === 'github'}
            {@const details = activity.details as SelectActivityGithub}
            <ActivityItemGithub
              {details}
              timestamp={activity.timestamp}
              isPrivate={activity.isPrivate}
              isAdmin={data.isAdmin}
              onHide={() => hideActivity(activity.id, details?.title)}
            />
          {:else if activity.type === 'bluesky'}
            {@const details = activity.details as SelectActivityBluesky}
            {@const thread = (activity.thread || []) as BlueskyThreadPost[]}
            <ActivityItemBluesky
              externalId={activity.externalId}
              {thread}
              authors={authorsMap}
              timestamp={activity.timestamp}
              isPrivate={activity.isPrivate}
              isAdmin={data.isAdmin}
              onHide={() => hideActivity(activity.id, details?.title)}
            />
          {:else if activity.type === 'hackernews'}
            {@const details = activity.details as SelectActivityHackernews}
            <ActivityItemHackernews
              {details}
              timestamp={activity.timestamp}
              isPrivate={activity.isPrivate}
              isAdmin={data.isAdmin}
              onHide={() => hideActivity(activity.id, details?.title)}
            />
          {:else if activity.type === 'reddit'}
            {@const details = activity.details as SelectActivityReddit}
            <ActivityItemReddit
              {details}
              timestamp={activity.timestamp}
              isPrivate={activity.isPrivate}
              isAdmin={data.isAdmin}
              onHide={() => hideActivity(activity.id, details?.title)}
            />
          {:else if activity.type === 'bgg'}
            {@const details = activity.details as SelectActivityBgg}
            <ActivityItemBgg
              {details}
              timestamp={activity.timestamp}
              isPrivate={activity.isPrivate}
              isAdmin={data.isAdmin}
              onHide={() => hideActivity(activity.id, details?.title)}
            />
          {:else if activity.type === 'steam'}
            {@const details = activity.details as SelectActivitySteam}
            <ActivityItemSteam
              {details}
              timestamp={activity.timestamp}
              isPrivate={activity.isPrivate}
              isAdmin={data.isAdmin}
              onHide={() => hideActivity(activity.id, details?.gameTitle)}
            />
          {/if}

          {#if isSearching}
            {@const excerpt = pickExcerpt(activity)}
            {#if excerpt}
              <div class="activity__excerpt">
                {#each parseExcerpt(excerpt) as segment}
                  {#if segment.hl}<mark class="activity__excerptMark">{segment.text}</mark>{:else}{segment.text}{/if}
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>

    {#if !hasMore && !isLoading && activities.length > 0}
      <p class="activity__allLoaded">All activity loaded</p>
    {/if}
  {/if}

  {#if data.isAdmin}
    <div class="activity__admin">
      <p>Clear all activity by type:</p>
      <div class="activity__adminButtons">
        {#each activityTypes.filter((t) => t !== 'all') as type}
          <button onclick={() => clearType(type)}>
            <img src={getTypeIcon(type, iconColor)} alt="" class="activity__adminIcon" />
            Clear {type}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .activity {
    max-width: 40rem;
    margin: 0 auto;
  }

  /* Keep clear of the fixed heatmap: stay centered on wide screens, but
     never let the right edge slide under the viz (~9rem wide with the BGG column) */
  .activity--withViz {
    margin-right: max(calc((100% - 40rem) / 2), 9rem);
  }

  .activity__header {
    margin-bottom: 2rem;
  }

  .activity__titleRow {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 1rem;
  }

  .activity__title {
    display: flex;
    align-items: start;
    gap: 2rem;
  }

  .activity__title h1 {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
    animation-duration: 0.25s;
    animation-name: slidedown;
    animation-fill-mode: both;
    animation-timing-function: ease-in-out;
  }

  @keyframes slidedown {
    from {
      opacity: 0;
      transform: translateY(-3rem);
    }
    to {
      opacity: 1;
    }
  }

  .activity__headerRight {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .activity__filterPopover {
    display: flex;
    gap: 1rem;
    padding: 1rem 0;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .activity__filterArrow {
    color: var(--subtle);
  }

  .activity__search {
    width: 12rem;
  }

  .activity__excerpt {
    margin-top: 0.5rem;
    padding: 0.25rem 1rem;
    border-left: 2px solid var(--visBg);
    font-size: 0.85rem;
    color: var(--subtle);
    overflow-wrap: break-word;
  }

  .activity__excerptMark {
    background: transparent;
    color: var(--fg);
    border: 2px solid var(--fg);
    padding: 0.1em 0.35em;
  }

  .activity__empty {
    color: var(--subtle);
  }

  .activity__list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .activity__allLoaded {
    animation: fadein 0.5s;
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
    animation-delay: 1s;
    opacity: 0;
    text-align: center;
    padding: 2rem;
    color: var(--subtle);
  }

  @keyframes fadein {
    to {
      opacity: 1;
    }
  }

  .activity__admin {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--subtle);
  }

  .activity__admin p {
    color: var(--subtle);
    margin-bottom: 1rem;
  }

  .activity__adminButtons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .activity__adminButtons button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--subtle);
    border-radius: 0.25rem;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    color: var(--subtle);
  }

  .activity__adminButtons button:hover {
    border-color: red;
    color: red;
  }

  .activity__adminIcon {
    width: 1rem;
    height: 1rem;
    vertical-align: -0.15em;
  }

  /* The fixed heatmap narrows the column, so the header stacks well before
     the mobile breakpoint */
  @media (max-width: 1024px) {
    .activity__titleRow {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    .activity__headerRight {
      width: 100%;
    }

    .activity__search {
      flex: 1;
      width: auto;
      min-width: 0;
    }
  }

  @media (max-width: 768px) {
    .activity--withViz {
      margin-right: auto;
    }

    .activity__headerRight {
      flex-direction: column;
      align-items: stretch;
    }

    .activity__headerRight :global(button) {
      width: 100%;
    }

    .activity__search {
      flex: none;
      width: 100%;
    }

    .activity__filterPopover {
      flex-direction: column;
      align-items: stretch;
    }

    .activity__filterArrow {
      display: none;
    }
  }
</style>
