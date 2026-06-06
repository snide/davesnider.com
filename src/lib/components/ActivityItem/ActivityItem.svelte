<script lang="ts">
  import { mode } from 'mode-watcher';
  import type { Snippet } from 'svelte';

  interface Props {
    type: string;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
    children: Snippet;
  }

  let { type, timestamp, isPrivate, isAdmin, onHide, children }: Props = $props();

  let iconColor = $derived(mode.current === 'light' ? 'black' : 'white');

  function getTypeIcon(activityType: string, color: string): string {
    const base = 'https://cdn.simpleicons.org';
    switch (activityType) {
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

  function formatTimestamp(ts: number): string {
    const date = new Date(ts * 1000);
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

  function getTypeLabel(activityType: string): string {
    switch (activityType) {
      case 'hackernews':
        return 'Hacker News';
      case 'bgg':
        return 'BGG';
      default:
        return activityType.charAt(0).toUpperCase() + activityType.slice(1);
    }
  }
</script>

<div class="activityItem activityItem--{type}">
  <div class="activityItem__header">
    {#if type === 'plex'}
      <svg class="activityItem__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <circle cx="8" cy="8" r="7" stroke-width="1.5" />
        <path d="M6.5 5L10.5 8L6.5 11" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    {:else}
      <img src={getTypeIcon(type, iconColor)} alt="" class="activityItem__icon" />
    {/if}
    <span class="activityItem__type">{getTypeLabel(type)}</span>
    <span class="activityItem__time">{formatTimestamp(timestamp)}</span>
    {#if isPrivate && isAdmin}
      <span class="activityItem__private">private</span>
    {/if}
    {#if isAdmin}
      <button class="activityItem__hide" onclick={onHide}>&times;</button>
    {/if}
  </div>
  <div class="activityItem__body">
    {@render children()}
  </div>
</div>

<style>
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

  .activityItem__icon {
    width: 1rem;
    height: 1rem;
    color: var(--fg);
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

  .activityItem__hide {
    opacity: 0;
    background: none;
    border: none;
    color: var(--subtle);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
    transition: opacity 0.15s;
  }

  .activityItem__hide:hover {
    color: red;
  }

  .activityItem:hover .activityItem__hide {
    opacity: 1;
  }

  .activityItem__body {
    margin-left: 1.75rem;
  }

  /* Type-specific modifiers */
  .activityItem--github,
  .activityItem--hackernews,
  .activityItem--reddit,
  .activityItem--bgg {
    margin-bottom: 1rem;
  }

  .activityItem--bluesky .activityItem__body {
    margin-left: 1rem;
  }
</style>
