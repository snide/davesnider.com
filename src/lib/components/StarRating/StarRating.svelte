<script lang="ts">
  type Props = {
    rating: number;
    isEditing?: boolean;
    onRate?: (value: number) => void;
  };

  let { rating, isEditing = false, onRate }: Props = $props();

  let hoverRating = $state(0);

  function displayRating(star: number): string {
    const effectiveRating = hoverRating || rating;
    return effectiveRating >= star ? '★' : '☆';
  }
</script>

{#if isEditing}
  <div class="starRating" onmouseleave={() => (hoverRating = 0)}>
    {#each [1, 2, 3, 4, 5] as star}<button
        type="button"
        class="starRating__star"
        onclick={() => onRate?.(star)}
        onmouseenter={() => (hoverRating = star)}
      >
        {displayRating(star)}
      </button>{/each}
  </div>
{:else}
  <div class="starRating">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</div>
{/if}

<style>
  .starRating {
    color: var(--subtle);
    letter-spacing: 0.1em;
  }

  .starRating__star {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    color: inherit;
    padding: 0;
    margin: 0;
    letter-spacing: inherit;
  }

  .starRating__star:hover,
  .starRating__star:focus {
    color: var(--fg);
  }
</style>
