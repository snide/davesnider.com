<script lang="ts">
  import Button from '#lib/components/Button/Button.svelte';
  import StarRating from '#lib/components/StarRating/StarRating.svelte';
  import { VALID_BOOK_FORMATS, type BookFormat } from '#db/schema.js';

  interface BookSearchResult {
    key: string;
    title: string;
    author: string | null;
    coverId: number | null;
    coverUrl: string | null;
    year: number | null;
    editionCount: number;
  }

  const FORMAT_LABELS: Record<BookFormat, string> = {
    ebook: 'Ebook (Kindle)',
    audiobook: 'Audiobook (Libby)',
    print: 'Print'
  };

  let query = $state('');
  let results = $state<BookSearchResult[]>([]);
  let selected = $state<BookSearchResult | null>(null);
  let error = $state('');
  let success = $state('');
  let isSearching = $state(false);
  let isSubmitting = $state(false);
  let format = $state<BookFormat>('ebook');
  let rating = $state(0);
  let coverOverride = $state('');
  let year = $state<number | null>(null);
  let yearSource = $state<'work' | 'search' | null>(null);
  let isLoadingYear = $state(false);
  let workSeq = 0;
  let timestamp = $state(formatDateTimeLocal(new Date()));

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchSeq = 0;

  function formatDateTimeLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function onQueryInput() {
    clearTimeout(searchTimer);
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      return;
    }
    searchTimer = setTimeout(() => search(q), 300);
  }

  async function search(q: string) {
    const seq = ++searchSeq;
    isSearching = true;
    error = '';
    try {
      const res = await fetch(`/api/activity/openlibrary/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (seq !== searchSeq) return; // a newer search superseded this one
      if (!res.ok) {
        error = data.error || 'Search failed';
        results = [];
        return;
      }
      results = data.results;
    } catch {
      if (seq === searchSeq) error = 'Network error';
    } finally {
      if (seq === searchSeq) isSearching = false;
    }
  }

  function select(result: BookSearchResult) {
    selected = result;
    results = [];
    success = '';
    error = '';
    year = result.year;
    yearSource = result.year ? 'search' : null;
    loadWorkYear(result.key);
  }

  // The search index's year is a minimum over editions and is sometimes wrong;
  // the work record's curated first_publish_date wins when present.
  async function loadWorkYear(key: string) {
    const seq = ++workSeq;
    isLoadingYear = true;
    try {
      const res = await fetch(`/api/activity/openlibrary/work?key=${encodeURIComponent(key)}`);
      if (seq !== workSeq) return;
      if (!res.ok) return;
      const data = await res.json();
      if (seq !== workSeq) return;
      if (data.year) {
        year = data.year;
        yearSource = 'work';
      }
    } catch {
      // keep the search year
    } finally {
      if (seq === workSeq) isLoadingYear = false;
    }
  }

  function clearSelection() {
    workSeq++;
    selected = null;
    coverOverride = '';
    year = null;
    yearSource = null;
    isLoadingYear = false;
  }

  async function submit() {
    if (!selected) return;

    isSubmitting = true;
    error = '';
    success = '';

    try {
      const ts = Math.floor(new Date(timestamp).getTime() / 1000);
      const res = await fetch('/api/activity/add/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: selected.key,
          title: selected.title,
          author: selected.author,
          coverId: selected.coverId,
          coverUrl: coverOverride.trim() || undefined,
          year: year || null,
          format,
          timestamp: ts,
          rating: rating || undefined
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || data.message || 'Failed to add';
        return;
      }

      if (data.message) {
        error = data.message;
        return;
      }

      success = `Added ${selected.title}${data.coverUploaded ? '' : ' (no cover found)'}`;

      // Reset form
      query = '';
      results = [];
      selected = null;
      rating = 0;
      coverOverride = '';
      year = null;
      yearSource = null;
      format = 'ebook';
      timestamp = formatDateTimeLocal(new Date());
    } catch {
      error = 'Network error';
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimer);
      const q = query.trim();
      if (q.length >= 2) search(q);
    }
  }
</script>

<div class="bookAddForm">
  {#if !selected}
    <div class="bookAddForm__inputRow">
      <input
        type="text"
        placeholder="Search by title or author"
        bind:value={query}
        oninput={onQueryInput}
        onkeydown={handleKeydown}
        class="bookAddForm__input"
        disabled={isSubmitting}
      />
      {#if isSearching}
        <span class="bookAddForm__status">Searching…</span>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="bookAddForm__error">{error}</div>
  {/if}

  {#if success}
    <div class="bookAddForm__success">{success}</div>
  {/if}

  {#if results.length > 0 && !selected}
    <ul class="bookAddForm__results">
      {#each results as result (result.key)}
        <li>
          <button type="button" class="bookAddForm__result" onclick={() => select(result)}>
            {#if result.coverUrl}
              <img src={result.coverUrl} alt="" class="bookAddForm__resultCover" loading="lazy" />
            {:else}
              <div class="bookAddForm__resultCover bookAddForm__resultCover--empty"></div>
            {/if}
            <span class="bookAddForm__resultInfo">
              <span class="bookAddForm__resultTitle">{result.title}</span>
              <span class="bookAddForm__resultMeta">
                {#if result.author}{result.author}{/if}
                {#if result.year}&nbsp;({result.year}){/if}
              </span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if selected}
    <div class="bookAddForm__preview">
      <div class="bookAddForm__previewContent">
        {#if coverOverride.trim() || selected.coverUrl}
          <img src={coverOverride.trim() || selected.coverUrl} alt="" class="bookAddForm__cover" />
        {/if}
        <div class="bookAddForm__info">
          <div class="bookAddForm__type">Book</div>
          <div class="bookAddForm__title">
            {selected.title}{#if year}&nbsp;({year}){/if}
          </div>
          {#if selected.author}
            <div class="bookAddForm__author">by {selected.author}</div>
          {/if}
          <a
            href={`https://openlibrary.org/works/${selected.key}`}
            target="_blank"
            rel="noopener noreferrer"
            class="bookAddForm__link"
          >
            {selected.key} on Open Library
          </a>
          <button type="button" class="bookAddForm__change" onclick={clearSelection}>Choose a different book</button>
        </div>
      </div>

      <div class="bookAddForm__fields">
        <div class="bookAddForm__field">
          <label class="bookAddForm__label" for="bookAddForm-format">Format</label>
          <select id="bookAddForm-format" bind:value={format} class="bookAddForm__select">
            {#each VALID_BOOK_FORMATS as f (f)}
              <option value={f}>{FORMAT_LABELS[f]}</option>
            {/each}
          </select>
        </div>

        <div class="bookAddForm__field">
          <label class="bookAddForm__label" for="bookAddForm-year">
            First published
            {#if isLoadingYear}
              <span class="bookAddForm__hint">checking work record…</span>
            {:else if yearSource === 'work'}
              <span class="bookAddForm__hint">from work record</span>
            {:else if yearSource === 'search'}
              <span class="bookAddForm__hint">earliest edition, may be off</span>
            {/if}
          </label>
          <input
            id="bookAddForm-year"
            type="number"
            min="1"
            max="2100"
            step="1"
            placeholder="Year"
            bind:value={year}
            class="bookAddForm__year"
          />
        </div>

        <div class="bookAddForm__field">
          <label class="bookAddForm__label" for="bookAddForm-finished">When finished</label>
          <input id="bookAddForm-finished" type="datetime-local" bind:value={timestamp} class="bookAddForm__datetime" />
        </div>

        <div class="bookAddForm__field">
          <span class="bookAddForm__label">Rating (optional)</span>
          <StarRating {rating} isEditing onRate={(r) => (rating = r)} />
        </div>

        <div class="bookAddForm__field">
          <label class="bookAddForm__label" for="bookAddForm-cover">Cover URL override (optional)</label>
          <input
            id="bookAddForm-cover"
            type="url"
            placeholder="https://…/cover.jpg"
            bind:value={coverOverride}
            class="bookAddForm__input"
          />
        </div>
      </div>

      <Button onclick={submit} disabled={isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add to Activity'}
      </Button>
    </div>
  {/if}
</div>

<style>
  .bookAddForm {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 30rem;
  }

  .bookAddForm__inputRow {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .bookAddForm__input {
    flex: 1;
    width: 100%;
    padding: 0.5rem;
    font-family: inherit;
    font-size: 1rem;
    background: var(--bg);
    border: 1px solid var(--subtle);
    color: var(--fg);
  }

  .bookAddForm__input:focus {
    outline: none;
    border-color: var(--fg);
  }

  .bookAddForm__status {
    font-size: 0.875rem;
    color: var(--subtle);
    white-space: nowrap;
  }

  .bookAddForm__error {
    color: red;
    font-size: 0.875rem;
  }

  .bookAddForm__success {
    color: green;
    font-size: 0.875rem;
  }

  .bookAddForm__results {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    max-height: 24rem;
    overflow-y: auto;
  }

  .bookAddForm__result {
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

  .bookAddForm__result:hover {
    background: var(--bg);
  }

  .bookAddForm__resultCover {
    width: 2.5rem;
    height: 3.75rem;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--border);
  }

  .bookAddForm__resultCover--empty {
    opacity: 0.4;
  }

  .bookAddForm__resultInfo {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .bookAddForm__resultTitle {
    font-weight: 600;
  }

  .bookAddForm__resultMeta {
    font-size: 0.875rem;
    color: var(--subtle);
  }

  .bookAddForm__preview {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .bookAddForm__previewContent {
    display: flex;
    gap: 1rem;
  }

  .bookAddForm__cover {
    width: 6rem;
    height: auto;
    align-self: flex-start;
  }

  .bookAddForm__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .bookAddForm__type {
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--subtle);
    letter-spacing: 0.05em;
  }

  .bookAddForm__title {
    font-weight: 600;
    font-size: 1.125rem;
  }

  .bookAddForm__author {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .bookAddForm__link {
    font-size: 0.75rem;
    color: var(--subtle);
  }

  .bookAddForm__change {
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

  .bookAddForm__fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .bookAddForm__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .bookAddForm__label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--subtle);
  }

  .bookAddForm__hint {
    text-transform: none;
    letter-spacing: 0;
    margin-left: 0.5rem;
    opacity: 0.8;
  }

  .bookAddForm__year {
    width: 6rem;
  }

  .bookAddForm__select,
  .bookAddForm__year,
  .bookAddForm__datetime {
    padding: 0.5rem;
    font-family: inherit;
    font-size: 1rem;
    background: var(--bg);
    border: 1px solid var(--subtle);
    color: var(--fg);
    width: fit-content;
  }

  .bookAddForm__select:focus,
  .bookAddForm__year:focus,
  .bookAddForm__datetime:focus {
    outline: none;
    border-color: var(--fg);
  }
</style>
