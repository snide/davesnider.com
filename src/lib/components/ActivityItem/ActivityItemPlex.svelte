<script lang="ts">
  import type { SelectActivityPlex } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';
  import PlexReviewForm from '$lib/components/PlexReviewForm/PlexReviewForm.svelte';
  import StarRating from '$lib/components/StarRating/StarRating.svelte';

  interface Props {
    activityId: number;
    details: SelectActivityPlex;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
    onUpdate: (rating: number | null, review: string | null) => void;
  }

  let { activityId, details, timestamp, isPrivate, isAdmin, onHide, onUpdate }: Props = $props();

  let isEditing = $state(false);
</script>

<ActivityItem type="plex" {timestamp} {isPrivate} {isAdmin} {onHide}>
  <div class="plexBody">
    {#if details.thumbnailUrl}
      {#if details.imdbUrl}
        <a href={details.imdbUrl} target="_blank" rel="noopener noreferrer">
          <img src={details.thumbnailUrl} alt="" class="plexBody__poster" />
        </a>
      {:else}
        <img src={details.thumbnailUrl} alt="" class="plexBody__poster" />
      {/if}
    {/if}
    <div class="plexBody__content">
      <div class="plexBody__titleRow">
        {#if details.imdbUrl}
          <a href={details.imdbUrl} target="_blank" rel="noopener noreferrer" class="plexBody__title">
            {details.title}{#if details.year}&nbsp;({details.year}){/if}
          </a>
        {:else}
          <span class="plexBody__title">
            {details.title}{#if details.year}&nbsp;({details.year}){/if}
          </span>
        {/if}
        {#if details.director}
          <span class="plexBody__director">by {details.director}</span>
        {/if}
      </div>
      {#if !isEditing}
        {#if details.rating}
          <StarRating rating={details.rating} />
        {/if}
        {#if details.review}
          <div class="plexBody__review">{details.review}</div>
        {/if}
      {/if}
      {#if isAdmin}
        <PlexReviewForm
          {activityId}
          currentRating={details.rating ?? null}
          currentReview={details.review ?? null}
          onEditingChange={(editing) => (isEditing = editing)}
          onSave={(rating, review) => onUpdate(rating, review)}
        />
      {/if}
    </div>
  </div>
</ActivityItem>

<style>
  .plexBody {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .plexBody__poster {
    width: 6rem;
    height: auto;
    flex-shrink: 0;
  }

  .plexBody__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .plexBody__titleRow {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .plexBody__title {
    font-weight: 600;
    line-height: 1.4;
    text-decoration: none;
  }

  .plexBody__title:hover {
    text-decoration: underline;
  }

  .plexBody__director {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .plexBody__review {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
    white-space: pre-line;
  }

  @media (max-width: 768px) {
    .plexBody {
      display: block;
    }

    .plexBody__poster {
      float: left;
      margin-right: 1rem;
      margin-bottom: 0.5rem;
      width: 5rem;
    }

    .plexBody__content {
      display: block;
    }
  }
</style>
