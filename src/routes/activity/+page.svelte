<script lang="ts">
  import type { PageData } from './$types';
  import type { SelectActivityHackernews } from '$db/schema';
  import BlueskyThread from '$lib/components/BlueskyThread/BlueskyThread.svelte';

  let { data }: { data: PageData } = $props();

  const activityTypes = ['plex', 'github', 'bluesky', 'reddit', 'hackernews', 'bgg'];

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

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'plex':
        return '🎬';
      case 'github':
        return '💻';
      case 'bluesky':
        return '🦋';
      case 'reddit':
        return '🤖';
      case 'hackernews':
        return '📰';
      case 'bgg':
        return '🎲';
      default:
        return '📌';
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
    <h1>Activity</h1>
    <div class="activity__filters">
      <a href="/activity" class:activity__filter--active={!data.typeFilter}>All</a>
      {#each activityTypes as type}
        <a href="/activity?type={type}" class:activity__filter--active={data.typeFilter === type}>
          {getTypeIcon(type)}
          {type}
        </a>
      {/each}
    </div>
  </div>

  {#if data.activities.length === 0}
    <p class="activity__empty">No activity found</p>
  {:else}
    <div class="activity__list">
      {#each data.activities as activity}
        {#if activity.type === 'bluesky'}
          <div class="activityItem activityItem--bluesky">
            <div class="activityItem__blueskyHeader">
              <span class="activityItem__icon">{getTypeIcon(activity.type)}</span>
              <span class="activityItem__type">bluesky</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <BlueskyThread postUri={activity.externalId} currentUri={activity.externalId} />
          </div>
        {:else if activity.type === 'hackernews'}
          {const hnDetails = activity.details as SelectActivityHackernews | null}
          <a href="/activity/{activity.id}" class="activityItem activityItem--hackernews">
            <div class="activityItem__hnHeader">
              <span class="activityItem__icon">{getTypeIcon(activity.type)}</span>
              <span class="activityItem__type">{hnDetails?.itemType || 'hackernews'}</span>
              <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              {#if hnDetails?.hnScore}
                <span class="activityItem__hnScore">{hnDetails.hnScore} points</span>
              {/if}
              {#if activity.isPrivate && data.isAdmin}
                <span class="activityItem__private">🔒</span>
              {/if}
            </div>
            <div class="activityItem__hnTitle">{activity.title}</div>
            {#if hnDetails?.body}
              <div class="activityItem__hnBody">{@html hnDetails.body}</div>
            {/if}
          </a>
        {:else}
          <a href="/activity/{activity.id}" class="activityItem">
            <div class="activityItem__icon">{getTypeIcon(activity.type)}</div>
            <div class="activityItem__content">
              <div class="activityItem__header">
                <span class="activityItem__title">{activity.title}</span>
                {#if activity.isPrivate && data.isAdmin}
                  <span class="activityItem__private">🔒</span>
                {/if}
              </div>
              <div class="activityItem__meta">
                <span class="activityItem__type">{activity.type}</span>
                <span class="activityItem__time">{formatTimestamp(activity.timestamp)}</span>
              </div>
            </div>
            {#if activity.thumbnailUrl}
              <img src={activity.thumbnailUrl} alt="" class="activityItem__thumbnail" />
            {/if}
          </a>
        {/if}
      {/each}
    </div>

    <div class="activity__pagination">
      {#if data.page > 1}
        <a href="/activity?page={data.page - 1}{data.typeFilter ? `&type=${data.typeFilter}` : ''}">← Previous</a>
      {/if}
      <span>Page {data.page}</span>
      {#if data.activities.length === 20}
        <a href="/activity?page={data.page + 1}{data.typeFilter ? `&type=${data.typeFilter}` : ''}">Next →</a>
      {/if}
    </div>
  {/if}

  {#if data.isAdmin}
    <div class="activity__admin">
      <p>Clear all activity by type:</p>
      <div class="activity__adminButtons">
        {#each activityTypes as type}
          <button onclick={() => clearType(type)}>{getTypeIcon(type)} Clear {type}</button>
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

  .activity__header h1 {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
    margin-bottom: 1rem;
  }

  .activity__filters {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .activity__filters a {
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--subtle);
    border-radius: 1rem;
    font-size: 0.875rem;
    text-decoration: none;
    color: var(--subtle);
  }

  .activity__filters a:hover,
  .activity__filter--active {
    background-color: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
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
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--subtle);
    border-radius: 0.5rem;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.2s;
  }

  .activityItem:hover {
    border-color: var(--fg);
  }

  .activityItem__icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .activityItem__content {
    flex: 1;
    min-width: 0;
  }

  .activityItem__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .activityItem__title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activityItem__private {
    font-size: 0.75rem;
  }

  .activityItem__meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--subtle);
    margin-top: 0.25rem;
  }

  .activityItem__type {
    text-transform: capitalize;
  }

  .activityItem--bluesky {
    flex-direction: column;
    gap: 0.5rem;
  }

  .activityItem__blueskyHeader {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--subtle);
  }

  .activityItem__blueskyHeader .activityItem__icon {
    font-size: 1rem;
  }

  .activityItem__blueskyHeader .activityItem__type {
    text-transform: capitalize;
  }

  .activityItem--hackernews {
    flex-direction: column;
    gap: 0.5rem;
  }

  .activityItem__hnHeader {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--subtle);
  }

  .activityItem__hnHeader .activityItem__icon {
    font-size: 1rem;
  }

  .activityItem__hnHeader .activityItem__type {
    text-transform: capitalize;
  }

  .activityItem__hnScore {
    color: var(--subtle);
  }

  .activityItem__hnTitle {
    font-weight: 600;
    line-height: 1.4;
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
</style>
