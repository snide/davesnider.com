<script lang="ts">
  import type { PageData } from './$types';
  import type {
    SelectActivityHackernews,
    SelectActivityPlex,
    SelectActivityGithub,
    BlueskyThreadPost
  } from '$db/schema';
  import BlueskyThread from '$lib/components/BlueskyThread/BlueskyThread.svelte';
  import { mode } from 'mode-watcher';
  import { marked } from 'marked';
  import { goto } from '$app/navigation';

  let { data }: { data: PageData } = $props();

  const activityTypes = ['all', 'plex', 'github', 'bluesky', 'reddit', 'hackernews', 'bgg'];

  let filterPopoverIsOpen = $state(false);
  let typeFilter = $state(data.typeFilter || 'all');
  let sortOrder = $state<'asc' | 'desc'>(data.sortOrder as 'asc' | 'desc');
  let startDate = $state(data.startDate || '');
  let endDate = $state(data.endDate || '');

  function buildUrl() {
    const params = new URLSearchParams();
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
    if (sortOrder === 'asc') params.set('sort', 'asc');
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const queryString = params.toString();
    return queryString ? `/activity?${queryString}` : '/activity';
  }

  function applyFilters() {
    goto(buildUrl());
  }

  function buildPageUrl(page: number) {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
    if (sortOrder === 'asc') params.set('sort', 'asc');
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const queryString = params.toString();
    return queryString ? `/activity?${queryString}` : '/activity';
  }

  // Default to white (dark mode) since that's the default theme
  let iconColor = $derived(mode.current === 'light' ? 'black' : 'white');

  // Convert blueskyAuthors object to a Map for the component
  let authorsMap = $derived(new Map(Object.entries(data.blueskyAuthors || {})));

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
      window.location.reload();
    }
  }
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
      <button class="btn" onclick={() => (filterPopoverIsOpen = !filterPopoverIsOpen)}>
        {filterPopoverIsOpen ? 'Hide' : 'Show'} filters
      </button>
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

  {#if data.activities.length === 0}
    <p class="activity__empty">No activity found</p>
  {:else}
    <div class="activity__list">
      {#each data.activities as activity}
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
          <a href="/activity/{activity.id}" class="activityItem activityItem--plex">
            <div class="activityItem__header">
              <img src={getTypeIcon(activity.type, iconColor)} alt="" class="activityItem__icon" />
              <span class="activityItem__type">plex</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <div class="activityItem__body">
              {#if activity.thumbnailUrl}
                <img src={activity.thumbnailUrl} alt="" class="activityItem__plexPoster" />
              {/if}
              <div class="activityItem__plexContent">
                <div class="activityItem__title">{activity.title}</div>
                {#if plexDetails?.rating}
                  <div class="activityItem__plexRating">
                    {'★'.repeat(plexDetails.rating)}{'☆'.repeat(5 - plexDetails.rating)}
                  </div>
                {/if}
                {#if plexDetails?.review}
                  <div class="activityItem__plexReview">{plexDetails.review}</div>
                {/if}
              </div>
            </div>
          </a>
        {:else if activity.type === 'hackernews'}
          {@const hnDetails = activity.details as SelectActivityHackernews | null}
          <a href="/activity/{activity.id}" class="activityItem activityItem--hackernews">
            <div class="activityItem__header">
              <img src={getTypeIcon(activity.type, iconColor)} alt="" class="activityItem__icon" />
              <span class="activityItem__type">{hnDetails?.itemType || 'hackernews'}</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if hnDetails?.hnScore}
                <span class="activityItem__hnScore">{hnDetails.hnScore} points</span>
              {/if}
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <div class="activityItem__body">
              <div class="activityItem__title">{activity.title}</div>
              {#if hnDetails?.body}
                <div class="activityItem__hnBody">{@html hnDetails.body}</div>
              {/if}
            </div>
          </a>
        {:else if activity.type === 'github'}
          {@const ghDetails = activity.details as SelectActivityGithub | null}
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
                <div class="activityItem__githubMessage">{@html marked(ghDetails.commitMessage)}</div>
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

    <div class="activity__pagination">
      {#if data.page > 1}
        <a href={buildPageUrl(data.page - 1)}>← Previous</a>
      {/if}
      <span>Page {data.page}</span>
      {#if data.activities.length === 20}
        <a href={buildPageUrl(data.page + 1)}>Next →</a>
      {/if}
    </div>
  {/if}

  {#if data.isAdmin}
    <div class="activity__admin">
      <p>Clear all activity by type:</p>
      <div class="activity__adminButtons">
        {#each activityTypes as type}
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
    max-width: 50rem;
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
    margin-top: 0.5rem;
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
    max-width: 200px;
    max-height: 200px;
    border-radius: 0.5rem;
    object-fit: cover;
  }

  .activityItem--plex .activityItem__body {
    display: flex;
    gap: 1rem;
  }

  .activityItem__plexPoster {
    width: 5rem;
    height: auto;
    aspect-ratio: 2/3;
    object-fit: cover;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .activityItem__plexContent {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .activityItem__plexRating {
    color: var(--subtle);
    letter-spacing: 0.1em;
  }

  .activityItem__plexReview {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
  }

  .activityItem__hnScore {
    color: var(--subtle);
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

  .activity__pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    margin-top: 2rem;
    padding: 1rem 0;
  }

  .activity__pagination a {
    color: var(--fg);
  }

  .activity__pagination span {
    color: var(--subtle);
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
</style>
