<script lang="ts">
  import type { BookFormat, SelectActivityBook } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';
  import ReviewForm from '$lib/components/ReviewForm/ReviewForm.svelte';
  import StarRating from '$lib/components/StarRating/StarRating.svelte';

  interface Props {
    activityId: number;
    details: SelectActivityBook;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
    onUpdate: (rating: number | null, review: string | null) => void;
  }

  let { activityId, details, timestamp, isPrivate, isAdmin, onHide, onUpdate }: Props = $props();

  let isEditing = $state(false);

  const FORMAT_LABELS: Record<BookFormat, string> = {
    ebook: 'Read on Kindle',
    audiobook: 'Listened on Libby',
    print: 'Read in print'
  };

  let formatLabel = $derived(FORMAT_LABELS[details.format] ?? details.format);
</script>

<ActivityItem type="book" {timestamp} {isPrivate} {isAdmin} {onHide}>
  <div class="book">
    {#if details.thumbnailUrl}
      {#if details.openLibraryUrl}
        <a href={details.openLibraryUrl} target="_blank" rel="noopener noreferrer">
          <img src={details.thumbnailUrl} alt="" class="book__cover" />
        </a>
      {:else}
        <img src={details.thumbnailUrl} alt="" class="book__cover" />
      {/if}
    {/if}
    <div class="book__content">
      <div class="book__titleRow">
        {#if details.openLibraryUrl}
          <a href={details.openLibraryUrl} target="_blank" rel="noopener noreferrer" class="book__title">
            {details.title}{#if details.year}&nbsp;({details.year}){/if}
          </a>
        {:else}
          <span class="book__title">
            {details.title}{#if details.year}&nbsp;({details.year}){/if}
          </span>
        {/if}
        {#if details.author}
          <span class="book__author">by {details.author}</span>
        {/if}
      </div>
      <div class="book__format">{formatLabel}</div>
      {#if !isEditing}
        {#if details.rating}
          <StarRating rating={details.rating} />
        {/if}
        {#if details.review}
          <div class="book__review">{details.review}</div>
        {/if}
      {/if}
      {#if isAdmin}
        <ReviewForm
          endpoint={`/api/activity/book/${activityId}`}
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
  .book {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .book__cover {
    width: 6rem;
    height: auto;
    flex-shrink: 0;
  }

  .book__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .book__titleRow {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .book__title {
    font-weight: 600;
    line-height: 1.4;
    text-decoration: none;
  }

  .book__title:hover {
    text-decoration: underline;
  }

  .book__author {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .book__format {
    color: var(--subtle);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .book__review {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
    white-space: pre-line;
  }

  @media (max-width: 768px) {
    .book {
      display: block;
    }

    .book__cover {
      float: left;
      margin-right: 1rem;
      margin-bottom: 0.5rem;
      width: 5rem;
    }

    .book__content {
      display: block;
    }
  }
</style>
