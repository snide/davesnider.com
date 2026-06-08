<script lang="ts">
  import Button from '$lib/components/Button/Button.svelte';
  import StarRating from '$lib/components/StarRating/StarRating.svelte';

  interface OmdbLookupResponse {
    type: 'movie' | 'series' | 'episode';
    title: string;
    year: string;
    poster: string | null;
    imdbId: string;
    director?: string;
    season?: number;
    episode?: number;
    seriesId?: string;
    seriesTitle?: string;
    seriesYear?: string;
    seriesPoster?: string | null;
  }

  let imdbId = $state('');
  let preview = $state<OmdbLookupResponse | null>(null);
  let error = $state('');
  let isLooking = $state(false);
  let isSubmitting = $state(false);
  let rating = $state(0);
  let timestamp = $state(formatDateTimeLocal(new Date()));
  let success = $state('');

  function formatDateTimeLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function lookup() {
    if (!imdbId.trim()) {
      error = 'Please enter an IMDB ID';
      return;
    }

    const id = imdbId.trim().toLowerCase();
    if (!id.startsWith('tt')) {
      error = 'IMDB ID must start with "tt"';
      return;
    }

    error = '';
    preview = null;
    isLooking = true;

    try {
      const res = await fetch(`/api/activity/omdb/lookup?i=${encodeURIComponent(id)}`);
      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to lookup';
        return;
      }

      preview = data;
    } catch {
      error = 'Network error';
    } finally {
      isLooking = false;
    }
  }

  async function submit() {
    if (!preview) return;

    isSubmitting = true;
    error = '';
    success = '';

    try {
      const ts = Math.floor(new Date(timestamp).getTime() / 1000);
      const res = await fetch('/api/activity/add/plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: preview.imdbId,
          timestamp: ts,
          rating: rating || undefined
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || data.message || 'Failed to add';
        return;
      }

      success = data.merged
        ? `Episode added to existing show (${data.episodeCount} episodes total)`
        : `Added ${data.type === 'episode' ? 'episode' : data.type}`;

      // Reset form
      imdbId = '';
      preview = null;
      rating = 0;
      timestamp = formatDateTimeLocal(new Date());
    } catch {
      error = 'Network error';
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !preview) {
      lookup();
    }
  }
</script>

<div class="plexAddForm">
  <div class="plexAddForm__inputRow">
    <input
      type="text"
      placeholder="IMDB ID (e.g., tt1234567)"
      bind:value={imdbId}
      onkeydown={handleKeydown}
      class="plexAddForm__input"
      disabled={isLooking || isSubmitting}
    />
    <Button onclick={lookup} disabled={isLooking || isSubmitting || !imdbId.trim()}>
      {isLooking ? 'Looking up...' : 'Lookup'}
    </Button>
  </div>

  {#if error}
    <div class="plexAddForm__error">{error}</div>
  {/if}

  {#if success}
    <div class="plexAddForm__success">{success}</div>
  {/if}

  {#if preview}
    <div class="plexAddForm__preview">
      <div class="plexAddForm__previewContent">
        {#if preview.poster}
          <img src={preview.poster} alt="" class="plexAddForm__poster" />
        {/if}
        <div class="plexAddForm__info">
          <div class="plexAddForm__type">{preview.type}</div>
          <div class="plexAddForm__title">{preview.title} ({preview.year})</div>
          {#if preview.director}
            <div class="plexAddForm__director">Directed by {preview.director}</div>
          {/if}
          {#if preview.type === 'episode'}
            <div class="plexAddForm__episodeInfo">
              S{preview.season}.E{preview.episode}
              {#if preview.seriesTitle}
                of <strong>{preview.seriesTitle}</strong>
                ({preview.seriesYear})
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="plexAddForm__fields">
        <div class="plexAddForm__field">
          <label class="plexAddForm__label">When watched</label>
          <input type="datetime-local" bind:value={timestamp} class="plexAddForm__datetime" />
        </div>

        <div class="plexAddForm__field">
          <label class="plexAddForm__label">Rating (optional)</label>
          <StarRating {rating} isEditing onRate={(r) => (rating = r)} />
        </div>
      </div>

      <Button onclick={submit} disabled={isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add to Activity'}
      </Button>
    </div>
  {/if}
</div>

<style>
  .plexAddForm {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 30rem;
  }

  .plexAddForm__inputRow {
    display: flex;
    gap: 0.5rem;
  }

  .plexAddForm__input {
    flex: 1;
    padding: 0.5rem;
    font-family: inherit;
    font-size: 1rem;
    background: var(--bg);
    border: 1px solid var(--subtle);
    color: var(--fg);
  }

  .plexAddForm__input:focus {
    outline: none;
    border-color: var(--fg);
  }

  .plexAddForm__error {
    color: red;
    font-size: 0.875rem;
  }

  .plexAddForm__success {
    color: green;
    font-size: 0.875rem;
  }

  .plexAddForm__preview {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .plexAddForm__previewContent {
    display: flex;
    gap: 1rem;
  }

  .plexAddForm__poster {
    width: 6rem;
    height: auto;
  }

  .plexAddForm__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .plexAddForm__type {
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--subtle);
    letter-spacing: 0.05em;
  }

  .plexAddForm__title {
    font-weight: 600;
    font-size: 1.125rem;
  }

  .plexAddForm__director {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .plexAddForm__episodeInfo {
    font-size: 0.875rem;
    color: var(--subtle);
  }

  .plexAddForm__fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .plexAddForm__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .plexAddForm__label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--subtle);
  }

  .plexAddForm__datetime {
    padding: 0.5rem;
    font-family: inherit;
    font-size: 1rem;
    background: var(--bg);
    border: 1px solid var(--subtle);
    color: var(--fg);
    width: fit-content;
  }

  .plexAddForm__datetime:focus {
    outline: none;
    border-color: var(--fg);
  }
</style>
