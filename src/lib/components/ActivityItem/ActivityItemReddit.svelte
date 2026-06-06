<script lang="ts">
  import type { SelectActivityReddit } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';

  interface Props {
    details: SelectActivityReddit;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide }: Props = $props();
</script>

<ActivityItem type="reddit" {timestamp} {isPrivate} {isAdmin} {onHide}>
  <a
    href="https://reddit.com/r/{details.subreddit}"
    class="redditBody__subreddit"
    target="_blank"
    rel="noopener noreferrer"
  >
    r/{details.subreddit}
  </a>
  <a href={details.url} class="redditBody__title" target="_blank" rel="noopener noreferrer">
    {details.title}
  </a>
  {#if details.body}
    <div class="redditBody__text">{details.body}</div>
  {/if}
</ActivityItem>

<style>
  .redditBody__subreddit {
    display: block;
    font-family: 'BerkeleyMono', monospace;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: lowercase;
    letter-spacing: 0.05em;
    color: var(--fg);
    text-decoration: none;
  }

  .redditBody__subreddit:hover {
    text-decoration: underline;
  }

  .redditBody__title {
    font-weight: 600;
    line-height: 1.4;
    color: var(--subtle);
    text-decoration: none;
  }

  .redditBody__title:hover {
    text-decoration: underline;
  }

  .redditBody__text {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
    margin-top: 0.5rem;
    white-space: pre-line;
  }
</style>
