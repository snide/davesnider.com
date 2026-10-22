<script lang="ts">
  import Button from '#lib/components/Button/Button.svelte';
  import StarRating from '#lib/components/StarRating/StarRating.svelte';
  import { parseImdbId } from '#lib/utils/imdb.js';

  interface OmdbLookupResponse {
    type: 'movie' | 'series' | 'episode';
    title: string;
    year: string;
    poster: string | null;
    imdbId: string;
    director?: string;
    totalSeasons?: number;
    season?: number;
    episode?: number;
    seriesId?: string;
    seriesTitle?: string;
    seriesYear?: string;
    seriesPoster?: string | null;
  }

  interface OmdbSearchResult {
    imdbId: string;
    title: string;
    year: string;
    type: 'movie' | 'series' | 'episode';
    poster: string | null;
  }

  interface SeasonEpisode {
    imdbId: string;
    title: string;
    episode: number;
    released: string | null;
  }

  // Search
  let query = $state('');
  let results = $state<OmdbSearchResult[]>([]);
  let isSearching = $state(false);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchSeq = 0;

  // Series → season → episode picker
  let series = $state<OmdbLookupResponse | null>(null);
  let selectedSeason = $state(1);
  let episodes = $state<SeasonEpisode[]>([]);
  let selectedEpisodeId = $state('');
  let isLoadingEpisodes = $state(false);
  let seasonSeq = 0;

  // Final item + fields
  let preview = $state<OmdbLookupResponse | null>(null);
  let isLooking = $state(false);
  let isSubmitting = $state(false);
  let rating = $state(0);
  let timestamp = $state(formatDateTimeLocal(new Date()));
  let error = $state('');
  let success = $state('');

  let seasonNumbers = $derived(
    series?.totalSeasons ? Array.from({ length: series.totalSeasons }, (_, i) => i + 1) : [1]
  );

  function formatDateTimeLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function onQueryInput() {
    clearTimeout(searchTimer);
    const q = query.trim();
    if (q.length < 2 || parseImdbId(q)) {
      results = [];
      return;
    }
    searchTimer = setTimeout(() => search(q), 300);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(searchTimer);
    const q = query.trim();
    const id = parseImdbId(q);
    if (id) {
      lookup(id);
    } else if (q.length >= 2) {
      search(q);
    }
  }

  async function search(q: string) {
    const seq = ++searchSeq;
    isSearching = true;
    error = '';
    try {
      const res = await fetch(`/api/activity/omdb/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (seq !== searchSeq) return;
      if (!res.ok) {
        error = data.error || 'Search failed';
        results = [];
        return;
      }
      results = data.results;
      if (results.length === 0) error = 'No matches';
    } catch {
      if (seq === searchSeq) error = 'Network error';
    } finally {
      if (seq === searchSeq) isSearching = false;
    }
  }

  async function fetchLookup(id: string): Promise<OmdbLookupResponse | null> {
    const res = await fetch(`/api/activity/omdb/lookup?i=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) {
      error = data.error || 'Failed to lookup';
      return null;
    }
    return data;
  }

  // Resolve an IMDB id: series go to the picker, everything else straight to the preview
  async function lookup(id: string) {
    error = '';
    success = '';
    results = [];
    isLooking = true;
    try {
      const data = await fetchLookup(id);
      if (!data) return;
      if (data.type === 'series') {
        series = data;
        preview = null;
        selectedSeason = 1;
        await loadSeason(data.imdbId, 1);
      } else {
        preview = data;
      }
    } catch {
      error = 'Network error';
    } finally {
      isLooking = false;
    }
  }

  function selectResult(result: OmdbSearchResult) {
    lookup(result.imdbId);
  }

  async function loadSeason(seriesId: string, season: number) {
    const seq = ++seasonSeq;
    isLoadingEpisodes = true;
    episodes = [];
    selectedEpisodeId = '';
    try {
      const res = await fetch(`/api/activity/omdb/season?i=${encodeURIComponent(seriesId)}&season=${season}`);
      const data = await res.json();
      if (seq !== seasonSeq) return;
      if (!res.ok) {
        error = data.error || 'Failed to load season';
        return;
      }
      episodes = data.episodes;
      if (episodes.length === 0) error = 'No episodes listed for this season';
    } catch {
      if (seq === seasonSeq) error = 'Network error';
    } finally {
      if (seq === seasonSeq) isLoadingEpisodes = false;
    }
  }

  function onSeasonChange() {
    if (!series) return;
    error = '';
    preview = null;
    loadSeason(series.imdbId, selectedSeason);
  }

  async function onEpisodeChange() {
    if (!selectedEpisodeId) {
      preview = null;
      return;
    }
    error = '';
    isLooking = true;
    try {
      preview = await fetchLookup(selectedEpisodeId);
    } catch {
      error = 'Network error';
    } finally {
      isLooking = false;
    }
  }

  function logWholeSeries() {
    if (!series) return;
    preview = series;
    selectedEpisodeId = '';
  }

  function resetSelection() {
    series = null;
    preview = null;
    episodes = [];
    selectedEpisodeId = '';
    error = '';
  }

  function resetAll() {
    resetSelection();
    query = '';
    results = [];
    rating = 0;
    timestamp = formatDateTimeLocal(new Date());
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

      resetAll();
    } catch {
      error = 'Network error';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="plexAddForm">
  {#if !series && !preview}
    <div class="plexAddForm__inputRow">
      <input
        type="text"
        placeholder="Search a title, or paste an IMDB ID / URL"
        bind:value={query}
        oninput={onQueryInput}
        onkeydown={handleKeydown}
        class="plexAddForm__input"
        disabled={isLooking || isSubmitting}
      />
      {#if parseImdbId(query.trim())}
        <Button onclick={() => lookup(parseImdbId(query.trim())!)} disabled={isLooking || isSubmitting}>
          {isLooking ? 'Looking up...' : 'Lookup'}
        </Button>
      {:else if isSearching || isLooking}
        <span class="plexAddForm__status">{isLooking ? 'Looking up…' : 'Searching…'}</span>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="plexAddForm__error">{error}</div>
  {/if}

  {#if success}
    <div class="plexAddForm__success">{success}</div>
  {/if}

  {#if results.length > 0 && !series && !preview}
    <ul class="plexAddForm__results">
      {#each results as result (result.imdbId)}
        <li>
          <button type="button" class="plexAddForm__result" onclick={() => selectResult(result)}>
            {#if result.poster}
              <img src={result.poster} alt="" class="plexAddForm__resultPoster" loading="lazy" />
            {:else}
              <div class="plexAddForm__resultPoster plexAddForm__resultPoster--empty"></div>
            {/if}
            <span class="plexAddForm__resultInfo">
              <span class="plexAddForm__resultTitle">{result.title} ({result.year})</span>
              <span class="plexAddForm__resultMeta">{result.type}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if series}
    <div class="plexAddForm__picker">
      <div class="plexAddForm__previewContent">
        {#if series.poster}
          <img src={series.poster} alt="" class="plexAddForm__poster" />
        {/if}
        <div class="plexAddForm__info">
          <div class="plexAddForm__type">series</div>
          <div class="plexAddForm__title">{series.title} ({series.year})</div>
          {#if series.totalSeasons}
            <div class="plexAddForm__director">{series.totalSeasons} seasons</div>
          {/if}
          <button type="button" class="plexAddForm__change" onclick={resetSelection}>Choose something else</button>
        </div>
      </div>

      <div class="plexAddForm__pickerRow">
        <div class="plexAddForm__field">
          <label class="plexAddForm__label" for="plexAddForm-season">Season</label>
          <select
            id="plexAddForm-season"
            bind:value={selectedSeason}
            onchange={onSeasonChange}
            class="plexAddForm__select"
            disabled={isLoadingEpisodes}
          >
            {#each seasonNumbers as n (n)}
              <option value={n}>Season {n}</option>
            {/each}
          </select>
        </div>

        <div class="plexAddForm__field plexAddForm__field--grow">
          <label class="plexAddForm__label" for="plexAddForm-episode">Episode</label>
          <select
            id="plexAddForm-episode"
            bind:value={selectedEpisodeId}
            onchange={onEpisodeChange}
            class="plexAddForm__select"
            disabled={isLoadingEpisodes || episodes.length === 0}
          >
            <option value="">{isLoadingEpisodes ? 'Loading…' : 'Pick an episode'}</option>
            {#each episodes as ep (ep.imdbId)}
              <option value={ep.imdbId}>E{ep.episode} · {ep.title}</option>
            {/each}
          </select>
        </div>
      </div>

      {#if preview?.type !== 'series'}
        <button type="button" class="plexAddForm__change" onclick={logWholeSeries}>Log the whole series instead</button>
      {/if}
    </div>
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
          {#if !series}
            <button type="button" class="plexAddForm__change" onclick={resetSelection}>Choose something else</button>
          {/if}
        </div>
      </div>

      <div class="plexAddForm__fields">
        <div class="plexAddForm__field">
          <label class="plexAddForm__label" for="plexAddForm-watched">When watched</label>
          <input id="plexAddForm-watched" type="datetime-local" bind:value={timestamp} class="plexAddForm__datetime" />
        </div>

        <div class="plexAddForm__field">
          <span class="plexAddForm__label">Rating (optional)</span>
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
    align-items: center;
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

  .plexAddForm__status {
    font-size: 0.875rem;
    color: var(--subtle);
    white-space: nowrap;
  }

  .plexAddForm__error {
    color: red;
    font-size: 0.875rem;
  }

  .plexAddForm__success {
    color: green;
    font-size: 0.875rem;
  }

  .plexAddForm__results {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    max-height: 24rem;
    overflow-y: auto;
  }

  .plexAddForm__result {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    width: 100%;
    padding: 0.5rem;
    background: none;
    border: 0;
    border-bottom: 1px solid var(--border);
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .plexAddForm__result:hover {
    background: var(--bg);
  }

  .plexAddForm__resultPoster {
    width: 2.5rem;
    height: 3.75rem;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--border);
  }

  .plexAddForm__resultPoster--empty {
    opacity: 0.4;
  }

  .plexAddForm__resultInfo {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .plexAddForm__resultTitle {
    font-weight: 600;
  }

  .plexAddForm__resultMeta {
    font-size: 0.75rem;
    color: var(--subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .plexAddForm__picker,
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
    align-self: flex-start;
  }

  .plexAddForm__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
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

  .plexAddForm__change {
    align-self: flex-start;
    margin-top: 0.25rem;
    padding: 0;
    background: none;
    border: 0;
    color: var(--subtle);
    font: inherit;
    font-size: 0.75rem;
    text-decoration: underline;
    cursor: pointer;
  }

  .plexAddForm__pickerRow {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
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

  .plexAddForm__field--grow {
    flex: 1;
    min-width: 12rem;
  }

  .plexAddForm__label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--subtle);
  }

  .plexAddForm__select,
  .plexAddForm__datetime {
    padding: 0.5rem;
    font-family: inherit;
    font-size: 1rem;
    background: var(--bg);
    border: 1px solid var(--subtle);
    color: var(--fg);
    width: fit-content;
    max-width: 100%;
  }

  .plexAddForm__field--grow .plexAddForm__select {
    width: 100%;
  }

  .plexAddForm__select:focus,
  .plexAddForm__datetime:focus {
    outline: none;
    border-color: var(--fg);
  }
</style>
