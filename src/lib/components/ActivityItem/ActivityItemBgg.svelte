<script lang="ts">
  import type { SelectActivityBgg } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';

  interface Props {
    details: SelectActivityBgg;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide }: Props = $props();

  let bggUrl = $derived(`https://boardgamegeek.com/boardgame/${details.gameId}`);
</script>

<ActivityItem type="bgg" {timestamp} {isPrivate} {isAdmin} {onHide}>
  <div class="bggBody">
    {#if details.thumbnailUrl}
      <a href={bggUrl} target="_blank" rel="noopener noreferrer">
        <img src={details.thumbnailUrl} alt="" class="bggBody__thumbnail" />
      </a>
    {/if}
    <div class="bggBody__content">
      <a href={bggUrl} target="_blank" rel="noopener noreferrer" class="bggBody__title">
        {details.title}
      </a>
      <div class="bggBody__meta">
        {#if details.playDate}
          <span>Played {details.playDate}</span>
        {/if}
        {#if details.numPlayers}
          <span>{details.numPlayers} player{details.numPlayers !== 1 ? 's' : ''}</span>
        {/if}
        {#if details.location}
          <span>at {details.location}</span>
        {/if}
      </div>
      {#if details.comments}
        <div class="bggBody__comments">{details.comments}</div>
      {/if}
    </div>
  </div>
</ActivityItem>

<style>
  .bggBody {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .bggBody__thumbnail {
    width: 4rem;
    height: 4rem;
    object-fit: cover;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .bggBody__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .bggBody__title {
    font-weight: 600;
    line-height: 1.4;
    text-decoration: none;
    color: var(--fg);
  }

  .bggBody__title:hover {
    text-decoration: underline;
  }

  .bggBody__meta {
    color: var(--subtle);
    font-size: 0.875rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .bggBody__meta span:not(:last-child)::after {
    content: ' \00b7';
    margin-left: 0.5rem;
  }

  .bggBody__comments {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
    white-space: pre-line;
    margin-top: 0.25rem;
  }

  @media (max-width: 768px) {
    .bggBody {
      display: block;
    }

    .bggBody__thumbnail {
      float: left;
      margin-right: 1rem;
      margin-bottom: 0.5rem;
    }
  }
</style>
