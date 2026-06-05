<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import type {
    SelectActivityHackernews,
    SelectActivityPlex,
    SelectActivityGithub,
    BlueskyThreadPost,
    SelectBlueskyAuthor
  } from '$db/schema';
  import BlueskyThread from '$lib/components/BlueskyThread/BlueskyThread.svelte';
  import Button from '$lib/components/Button/Button.svelte';
  import PlexReviewForm from '$lib/components/PlexReviewForm/PlexReviewForm.svelte';
  import StarRating from '$lib/components/StarRating/StarRating.svelte';
  import { mode } from 'mode-watcher';
  import { marked } from 'marked';
  import Loader from '$lib/components/StlViewer/Loader.svelte';

  // Configure marked to wrap images in links
  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${href}" alt="${text}"${titleAttr}></a>`;
  };
  marked.use({ renderer });

  let { data }: { data: PageData } = $props();

  type ActivityWithDetails = {
    id: number;
    type: string;
    externalId: string;
    timestamp: number;
    title: string;
    url: string | null;
    thumbnailUrl: string | null;
    isPrivate: boolean;
    createdAt: Date;
    details: unknown;
    thread?: BlueskyThreadPost[];
  };

  const activityTypes = ['all', 'plex', 'github', 'bluesky', 'reddit', 'hackernews', 'bgg'];

  let filterPopoverIsOpen = $state(false);
  let typeFilter = $state(data.typeFilter || 'all');
  let sortOrder = $state<'asc' | 'desc'>((data.sortOrder as 'asc' | 'desc') || 'desc');
  let startDate = $state(data.startDate || '');
  let endDate = $state(data.endDate || '');

  let activities = $state<ActivityWithDetails[]>(data.activities);
  let blueskyAuthors = $state<Record<string, SelectBlueskyAuthor>>(data.blueskyAuthors || {});
  let page = $state(1);
  let isLoading = $state(false);
  let hasMore = $state(data.activities.length === 20);
  let editingPlexId = $state<number | null>(null);

  // Default to white (dark mode) since that's the default theme
  let iconColor = $derived(mode.current === 'light' ? 'black' : 'white');

  // Convert blueskyAuthors object to a Map for the component
  let authorsMap = $derived(new Map(Object.entries(blueskyAuthors)));

  function buildFetchUrl(pageNum: number) {
    const params = new URLSearchParams();
    params.set('page', String(pageNum));
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
    if (sortOrder === 'asc') params.set('sort', 'asc');
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return `/api/activity/list?${params.toString()}`;
  }

  async function fetchData() {
    if (isLoading || !hasMore) return;
    isLoading = true;

    try {
      const response = await fetch(buildFetchUrl(page));
      const result = await response.json();

      if (result.activities && result.activities.length > 0) {
        // Merge activities, avoiding duplicates
        const existingIds = new Set(activities.map((a) => a.id));
        const newActivities = result.activities.filter((a: ActivityWithDetails) => !existingIds.has(a.id));
        activities = [...activities, ...newActivities];

        // Merge bluesky authors
        if (result.blueskyAuthors) {
          blueskyAuthors = { ...blueskyAuthors, ...result.blueskyAuthors };
        }

        hasMore = result.hasMore;
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error('Error fetching activities:', err);
    }

    isLoading = false;
  }

  function resetAndFetch() {
    activities = [];
    page = 1;
    hasMore = true;
    fetchData();
  }

  function applyFilters() {
    resetAndFetch();
  }

  let scrollDebounce: ReturnType<typeof setTimeout>;
  function handleScroll() {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      if (hasMore && !isLoading) {
        const scrollBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000;
        if (scrollBottom) {
          page++;
          fetchData();
        }
      }
    }, 100);
  }

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return date.toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'just now';
    }
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

  onMount(() => {
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });
</script>

<svelte:head>
  <title>Activity - Dave Snider</title>
  <meta name="description" content="Activity feed" />
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="activity">
  <div class="activity__header">
    <div class="activity__titleRow">
      <h1>Activity</h1>
      <div class="activity__headerRight">
        {#if isLoading}
          <Loader />
        {/if}
        <Button onclick={() => (filterPopoverIsOpen = !filterPopoverIsOpen)}>
          {filterPopoverIsOpen ? 'Hide' : 'Show'} filters
        </Button>
      </div>
    </div>

    {#if filterPopoverIsOpen}
      <div class="activity__filterPopover">
        <input type="date" bind:value={startDate} onchange={applyFilters} />
        <span class="activity__filterArrow">→</span>
        <input type="date" bind:value={endDate} onchange={applyFilters} />

        <select bind:value={sortOrder} onchange={applyFilters}>
          <option value="desc">New to Old</option>
          <option value="asc">Old to New</option>
        </select>

        <select bind:value={typeFilter} onchange={applyFilters}>
          {#each activityTypes as type}
            <option value={type}>
              {type === 'all' ? 'All services' : type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  {#if activities.length === 0 && !isLoading}
    <p class="activity__empty">No activity found</p>
  {:else}
    <div class="activity__list">
      {#each activities as activity (activity.id)}
        {#if activity.type === 'bluesky'}
          {@const thread = (activity.thread || []) as BlueskyThreadPost[]}
          <div class="activityItem activityItem--bluesky">
            <div class="activityItem__header">
              <img src={getTypeIcon(activity.type, iconColor)} alt="" class="activityItem__icon" />
              <span class="activityItem__type">bluesky</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <BlueskyThread {thread} authors={authorsMap} currentUri={activity.externalId} />
          </div>
        {:else if activity.type === 'plex'}
          {@const plexDetails = activity.details as SelectActivityPlex | null}
          <div class="activityItem activityItem--plex">
            <div class="activityItem__header">
              <img src={getTypeIcon(activity.type, iconColor)} alt="" class="activityItem__icon" />
              <span class="activityItem__type">Plex</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <div class="activityItem__body">
              {#if activity.thumbnailUrl}
                {#if plexDetails?.imdbUrl}
                  <a href={plexDetails.imdbUrl} target="_blank" rel="noopener noreferrer">
                    <img src={activity.thumbnailUrl} alt="" class="activityItem__plexPoster" />
                  </a>
                {:else}
                  <img src={activity.thumbnailUrl} alt="" class="activityItem__plexPoster" />
                {/if}
              {/if}
              <div class="activityItem__plexContent">
                <div class="activityItem__plexTitleRow">
                  {#if plexDetails?.imdbUrl}
                    <a href={plexDetails.imdbUrl} target="_blank" rel="noopener noreferrer" class="activityItem__title">
                      {activity.title}
                    </a>
                  {:else}
                    <span class="activityItem__title">{activity.title}</span>
                  {/if}
                  {#if plexDetails?.director}
                    <span class="activityItem__plexDirector">by {plexDetails.director}</span>
                  {/if}
                </div>
                {#if editingPlexId !== activity.id}
                  {#if plexDetails?.rating}
                    <StarRating rating={plexDetails.rating} />
                  {/if}
                  {#if plexDetails?.review}
                    <div class="activityItem__plexReview">{plexDetails.review}</div>
                  {/if}
                {/if}
                {#if data.isAdmin}
                  <PlexReviewForm
                    activityId={activity.id}
                    currentRating={plexDetails?.rating ?? null}
                    currentReview={plexDetails?.review ?? null}
                    onEditingChange={(editing) => (editingPlexId = editing ? activity.id : null)}
                    onSave={(rating, review) => {
                      const idx = activities.findIndex((a) => a.id === activity.id);
                      if (idx !== -1 && activities[idx].details) {
                        (activities[idx].details as SelectActivityPlex).rating = rating;
                        (activities[idx].details as SelectActivityPlex).review = review;
                      }
                    }}
                  />
                {/if}
              </div>
            </div>
          </div>
        {:else if activity.type === 'hackernews'}
          {@const hnDetails = activity.details as SelectActivityHackernews | null}
          {@const hnTypeMap = { story: 'Post', comment: 'Comment', ask: 'Ask HN', show: 'Show HN' }}
          {@const hnType = hnDetails?.itemType ? hnTypeMap[hnDetails.itemType] || 'Post' : 'Post'}
          {@const hnTitle = activity.title.replace(/^Comment on:\s*/i, '')}
          {@const isHnComment = hnDetails?.itemType === 'comment'}
          <div class="activityItem activityItem--hackernews">
            <div class="activityItem__header">
              <img src={getTypeIcon(activity.type, iconColor)} alt="" class="activityItem__icon" />
              <span class="activityItem__type">Hacker News</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <div class="activityItem__body">
              <div class="activityItem__hnRow">
                {#if hnDetails?.hnScore}<span class="activityItem__hnScore">▲{hnDetails.hnScore}</span>{/if}
                <div class="activityItem__hnContent">
                  <a href={activity.url} class="activityItem__hnTitle" target="_blank" rel="noopener noreferrer">
                    {hnType} - {hnTitle}
                  </a>
                  {#if hnDetails?.commentCount}
                    <div class="activityItem__hnComments">{hnDetails.commentCount} comments</div>
                  {/if}
                </div>
              </div>
              {#if hnDetails?.body}
                <div class="activityItem__reply" class:activityItem__reply--visible={isHnComment}>
                  <span class="activityItem__replyArrow">⤷</span>
                  <div class="activityItem__hnBody">{@html hnDetails.body}</div>
                </div>
              {/if}
            </div>
          </div>
        {:else if activity.type === 'github'}
          {@const ghDetails = activity.details as SelectActivityGithub | null}
          {@const isGhComment = ghDetails?.eventType === 'issue_comment'}
          <div class="activityItem activityItem--github">
            <div class="activityItem__header">
              <img src={getTypeIcon(activity.type, iconColor)} alt="" class="activityItem__icon" />
              <span class="activityItem__type">GitHub</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <div class="activityItem__body">
              <a
                href="https://github.com/{ghDetails?.repo}"
                class="activityItem__repo"
                target="_blank"
                rel="noopener noreferrer"
              >
                {ghDetails?.repo || 'github'}
              </a>
              <a href={activity.url} class="activityItem__githubTitle" target="_blank" rel="noopener noreferrer">
                {activity.title}
              </a>
              {#if ghDetails?.commitMessage && (ghDetails.eventType === 'issue_comment' || ghDetails.eventType === 'pr_opened')}
                <div class="activityItem__reply" class:activityItem__reply--visible={isGhComment}>
                  <span class="activityItem__replyArrow">⤷</span>
                  <div class="activityItem__githubMessage">{@html marked(ghDetails.commitMessage)}</div>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <a href="/activity/{activity.id}" class="activityItem">
            <div class="activityItem__header">
              <img src={getTypeIcon(activity.type, iconColor)} alt="" class="activityItem__icon" />
              <span class="activityItem__type">{activity.type}</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <div class="activityItem__body">
              <div class="activityItem__title">{activity.title}</div>
              {#if activity.thumbnailUrl}
                <img src={activity.thumbnailUrl} alt="" class="activityItem__thumbnail" />
              {/if}
            </div>
          </a>
        {/if}
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

  .activity__header {
    margin-bottom: 2rem;
  }

  .activity__titleRow {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 1rem;
  }

  .activity__titleRow h1 {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
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

  .activity__empty {
    color: var(--subtle);
  }

  .activity__list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .activityItem {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-decoration: none;
    color: inherit;
  }

  .activityItem__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--subtle);
  }

  .activityItem__header .activityItem__icon {
    width: 1rem;
    height: 1rem;
  }

  .activityItem__type {
    text-transform: capitalize;
  }

  .activityItem__time {
    color: var(--subtle);
  }

  .activityItem__private {
    font-size: 0.75rem;
  }

  .activityItem__body {
    margin-left: 1.75rem;
  }

  .activityItem__reply {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .activityItem__replyArrow {
    display: none;
    color: var(--subtle);
    font-size: 1rem;
    line-height: 1.6;
    flex-shrink: 0;
  }

  .activityItem__reply--visible .activityItem__replyArrow {
    display: block;
  }

  .activityItem__reply--visible .activityItem__hnBody,
  .activityItem__reply--visible .activityItem__githubMessage {
    flex: 1;
    min-width: 0;
  }

  .activityItem__title {
    font-weight: 600;
    line-height: 1.4;
  }

  .activityItem--bluesky :global(.thread) {
    margin-left: 1rem;
  }

  .activityItem--github {
    margin-bottom: 1rem;
  }

  .activityItem__repo {
    display: block;
    font-family: 'BerkeleyMono', monospace;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fg);
    text-decoration: none;
  }

  .activityItem__repo:hover {
    text-decoration: underline;
  }

  .activityItem__githubTitle {
    font-weight: 600;
    line-height: 1.4;
    color: var(--subtle);
    text-decoration: none;
  }

  .activityItem__githubTitle:hover {
    text-decoration: underline;
  }

  .activityItem__githubMessage {
    line-height: 1.6;
  }

  .activityItem__githubMessage :global(p) {
    margin: 0.5rem 0;
  }

  .activityItem__githubMessage :global(p:first-child) {
    margin-top: 0;
  }

  .activityItem__githubMessage :global(p:last-child) {
    margin-bottom: 0;
  }

  .activityItem__githubMessage :global(a) {
    color: var(--fg);
    text-decoration: underline;
  }

  .activityItem__githubMessage :global(code) {
    font-family: 'BerkeleyMono', monospace;
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-size: 0.9em;
  }

  .activityItem__githubMessage :global(pre) {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .activityItem__githubMessage :global(pre code) {
    background: none;
    padding: 0;
  }

  .activityItem__githubMessage :global(img) {
    max-width: 100%;
    height: auto;
  }

  .activityItem--plex .activityItem__body {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .activityItem__plexPoster {
    width: 6rem;
    height: auto;
    flex-shrink: 0;
  }

  .activityItem__plexContent {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .activityItem__plexTitleRow {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .activityItem__plexTitleRow .activityItem__title {
    text-decoration: none;
  }

  .activityItem__plexTitleRow .activityItem__title:hover {
    text-decoration: underline;
  }

  .activityItem__plexDirector {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .activityItem__plexReview {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
    white-space: pre-line;
  }

  .activityItem--hackernews {
    margin-bottom: 1rem;
  }

  .activityItem__hnRow {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .activityItem__hnContent {
    flex: 1;
    min-width: 0;
  }

  .activityItem__hnTitle {
    font-weight: 600;
    line-height: 1.4;
    color: var(--subtle);
    text-decoration: none;
  }

  .activityItem__hnTitle:hover {
    text-decoration: underline;
  }

  .activityItem__hnScore {
    background: var(--fg);
    color: var(--bg);
    padding: 0 0.3rem;
    font-size: 0.85em;
    flex-shrink: 0;
    text-decoration: none;
    display: inline-block;
  }

  .activityItem__hnComments {
    color: var(--subtle);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .activityItem__hnBody {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
  }

  .activityItem__hnBody :global(p) {
    margin: 0.5rem 0;
  }

  .activityItem__hnBody :global(p:first-child) {
    margin-top: 0;
  }

  .activityItem__hnBody :global(p:last-child) {
    margin-bottom: 0;
  }

  .activityItem__hnBody :global(a) {
    color: var(--fg);
    text-decoration: underline;
  }

  .activityItem__hnBody :global(i) {
    font-style: italic;
  }

  .activityItem__hnBody :global(code) {
    font-family: 'BerkeleyMono', monospace;
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-size: 0.9em;
  }

  .activityItem__hnBody :global(pre) {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .activityItem__hnBody :global(pre code) {
    background: none;
    padding: 0;
  }

  .activityItem__thumbnail {
    width: 4rem;
    height: 4rem;
    object-fit: cover;
    border-radius: 0.25rem;
    flex-shrink: 0;
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

  @media (max-width: 768px) {
    .activity__titleRow {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
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
