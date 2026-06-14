<script lang="ts">
  import type { SelectActivityBgg } from '$db/schema';
  import DOMPurify from 'isomorphic-dompurify';
  import ActivityItem from './ActivityItem.svelte';

  interface Props {
    details: SelectActivityBgg;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide }: Props = $props();

  let bggUrl = $derived(details ? `https://boardgamegeek.com/boardgame/${details.gameId}` : '');

  // The plays feed only counts players (the data is anonymized). numPlayers
  // includes the user, so the number of other people is numPlayers - 1.
  let numPlayers = $derived(details?.numPlayers ?? 1);
  let others = $derived(Math.max(0, numPlayers - 1));
  // How to describe the group: solo, a co-op team, or competitors.
  let group = $derived(
    numPlayers <= 1
      ? 'a solo game'
      : details?.coop
        ? `in a team of ${numPlayers} players`
        : others === 1
          ? 'against another player'
          : `against ${others} other players`
  );
  // Lead with the win/loss when it was recorded (🏆 on a win); otherwise just
  // describe who played.
  let playedWith = $derived(
    details?.won != null
      ? `${details.won ? '🏆 Won' : 'Lost'} ${group}`
      : numPlayers <= 1
        ? 'Played solo'
        : details?.coop
          ? `Played ${group}`
          : `Played with ${others} other${others === 1 ? '' : 's'}`
  );
</script>

<ActivityItem type="bgg" {timestamp} {isPrivate} {isAdmin} {onHide}>
  {#if details}
    <div class="bggGame">
      {#if details.thumbnailUrl}
        <a href={bggUrl} target="_blank" rel="noopener noreferrer">
          <img src={details.thumbnailUrl} alt="" class="bggGame__poster" />
        </a>
      {/if}
      <div class="bggGame__content">
        <div class="bggGame__titleRow">
          <a href={bggUrl} target="_blank" rel="noopener noreferrer" class="bggGame__title">
            {details.title}{#if details.gameYear}&nbsp;({details.gameYear}){/if}
          </a>
        </div>
        <div class="bggGame__meta">
          <span>{playedWith}</span>
          {#if details.location}
            <span>at {details.location}</span>
          {/if}
        </div>
        {#if details.comments}
          <div class="bggGame__notes">
            {@html DOMPurify.sanitize(details.comments, { ADD_ATTR: ['target'] })}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</ActivityItem>

<style>
  .bggGame {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .bggGame__poster {
    width: 6rem;
    height: auto;
    flex-shrink: 0;
  }

  .bggGame__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .bggGame__titleRow {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .bggGame__title {
    font-weight: 600;
    line-height: 1.4;
    text-decoration: none;
    color: var(--fg);
  }

  .bggGame__title:hover {
    text-decoration: underline;
  }

  .bggGame__meta {
    color: var(--subtle);
    font-size: 0.875rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .bggGame__meta span:not(:last-child)::after {
    content: ' \00b7';
    margin-left: 0.5rem;
  }

  .bggGame__notes {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
    margin-top: 0.25rem;
  }

  /* Notes are injected via {@html}, so the elements need :global to be styled */
  .bggGame__notes :global(p) {
    margin: 0.5rem 0;
  }

  .bggGame__notes :global(p:first-child) {
    margin-top: 0;
  }

  .bggGame__notes :global(p:last-child) {
    margin-bottom: 0;
  }

  .bggGame__notes :global(a) {
    color: var(--fg);
    text-decoration: none;
  }

  .bggGame__notes :global(a:hover) {
    text-decoration: underline;
  }

  .bggGame__notes :global(ul) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .bggGame__notes :global(ul:last-child) {
    margin-bottom: 0;
  }

  .bggGame__notes :global(li) {
    margin-bottom: 0.125rem;
  }

  /* Diamond marker, matching the blog post list style */
  .bggGame__notes :global(li::marker) {
    color: var(--listMarker);
    content: '❖ ';
  }

  @media (max-width: 768px) {
    .bggGame {
      display: block;
    }

    .bggGame__poster {
      float: left;
      margin-right: 1rem;
      margin-bottom: 0.5rem;
      width: 5rem;
    }

    .bggGame__content {
      display: block;
    }
  }
</style>
