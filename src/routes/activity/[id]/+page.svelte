<script lang="ts">
  import type { PageData } from './$types';
  import type {
    SelectActivityPlex,
    SelectActivityGithub,
    SelectActivityBluesky,
    SelectActivityReddit,
    SelectActivityHackernews,
    SelectActivityBgg,
    SelectBlueskyAuthor
  } from '$db/schema';
  import BlueskyThread from '$lib/components/BlueskyThread/BlueskyThread.svelte';

  let { data }: { data: PageData } = $props();
  let isEditing = $state(false);

  // Convert blueskyAuthors object to a Map for the component
  let authorsMap = $derived(new Map(Object.entries(data.blueskyAuthors || {})) as Map<string, SelectBlueskyAuthor>);

  // Type-safe accessors for details
  const plexDetails = $derived(
    data.activity.type === 'plex' ? (data.activity.details as SelectActivityPlex | null) : null
  );
  const githubDetails = $derived(
    data.activity.type === 'github' ? (data.activity.details as SelectActivityGithub | null) : null
  );
  const blueskyDetails = $derived(
    data.activity.type === 'bluesky' ? (data.activity.details as SelectActivityBluesky | null) : null
  );
  const redditDetails = $derived(
    data.activity.type === 'reddit' ? (data.activity.details as SelectActivityReddit | null) : null
  );
  const hnDetails = $derived(
    data.activity.type === 'hackernews' ? (data.activity.details as SelectActivityHackernews | null) : null
  );
  const bggDetails = $derived(
    data.activity.type === 'bgg' ? (data.activity.details as SelectActivityBgg | null) : null
  );

  // Initialize from data directly to avoid derived value warning
  const initialPlex = data.activity.type === 'plex' ? (data.activity.details as SelectActivityPlex | null) : null;
  let review = $state(initialPlex?.review || '');
  let rating = $state(initialPlex?.rating || 0);

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'plex':
        return '🎬';
      case 'github':
        return '💻';
      case 'bluesky':
        return '🦋';
      case 'reddit':
        return '🤖';
      case 'hackernews':
        return '📰';
      case 'bgg':
        return '🎲';
      default:
        return '📌';
    }
  }

  async function togglePrivate() {
    const response = await fetch(`/api/activity/${data.activity.id}`, {
      method: 'POST'
    });
    if (response.ok) {
      window.location.reload();
    }
  }

  async function deleteActivity() {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    const response = await fetch(`/api/activity/${data.activity.id}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      window.location.href = '/activity';
    }
  }

  async function saveReview() {
    const response = await fetch(`/api/activity/plex/${data.activity.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review, rating: rating || null })
    });
    if (response.ok) {
      isEditing = false;
      window.location.reload();
    }
  }
</script>

<svelte:head>
  <title>{data.activity.title} - Activity</title>
  <meta name="description" content={data.activity.title} />
</svelte:head>

<div class="activityDetail">
  <a href="/activity" class="activityDetail__back">← Back to Activity</a>

  <div class="activityDetail__header">
    <span class="activityDetail__icon">{getTypeIcon(data.activity.type)}</span>
    <h1>{data.activity.title}</h1>
    {#if data.activity.isPrivate && data.isAdmin}
      <span class="activityDetail__private">🔒 Private</span>
    {/if}
  </div>

  <div class="activityDetail__meta">
    <span class="activityDetail__type">{data.activity.type}</span>
    <span class="activityDetail__time">{formatTimestamp(data.activity.timestamp)}</span>
  </div>

  {#if data.activity.thumbnailUrl}
    <img src={data.activity.thumbnailUrl} alt="" class="activityDetail__thumbnail" />
  {/if}

  {#if data.activity.url}
    <a href={data.activity.url} target="_blank" rel="noopener noreferrer" class="activityDetail__link">
      View original →
    </a>
  {/if}

  <!-- Type-specific details -->
  {#if plexDetails}
    <div class="activityDetail__plex">
      {#if plexDetails.director}
        <p>
          <strong>Director:</strong>
          {plexDetails.director}
        </p>
      {/if}
      {#if plexDetails.year}
        <p>
          <strong>Year:</strong>
          {plexDetails.year}
        </p>
      {/if}
      {#if plexDetails.duration}
        <p>
          <strong>Duration:</strong>
          {plexDetails.duration} minutes
        </p>
      {/if}
      {#if plexDetails.imdbUrl}
        <p><a href={plexDetails.imdbUrl} target="_blank" rel="noopener noreferrer">View on IMDB →</a></p>
      {/if}

      {#if data.isAdmin && isEditing}
        <div class="activityDetail__edit">
          <label>
            Rating:
            <select bind:value={rating}>
              <option value={0}>No rating</option>
              <option value={1}>1 star</option>
              <option value={2}>2 stars</option>
              <option value={3}>3 stars</option>
              <option value={4}>4 stars</option>
              <option value={5}>5 stars</option>
            </select>
          </label>
          <label>
            Review:
            <textarea bind:value={review} rows="4"></textarea>
          </label>
          <div class="activityDetail__editActions">
            <button onclick={saveReview}>Save</button>
            <button onclick={() => (isEditing = false)}>Cancel</button>
          </div>
        </div>
      {:else}
        {#if plexDetails.rating}
          <p>
            <strong>Rating:</strong>
            {'★'.repeat(plexDetails.rating)}{'☆'.repeat(5 - plexDetails.rating)}
          </p>
        {/if}
        {#if plexDetails.review}
          <p>
            <strong>Review:</strong>
            {plexDetails.review}
          </p>
        {/if}
        {#if data.isAdmin}
          <button onclick={() => (isEditing = true)}>Edit review</button>
        {/if}
      {/if}
    </div>
  {/if}

  {#if githubDetails}
    <div class="activityDetail__github">
      <p>
        <strong>Event:</strong>
        {githubDetails.eventType}
      </p>
      <p>
        <strong>Repository:</strong>
        {githubDetails.repo}
      </p>
      {#if githubDetails.ref}
        <p>
          <strong>Ref:</strong>
          {githubDetails.ref}
        </p>
      {/if}
      {#if githubDetails.commitMessage}
        <p>
          <strong>Commit:</strong>
          {githubDetails.commitMessage}
        </p>
      {/if}
    </div>
  {/if}

  {#if blueskyDetails}
    <div class="activityDetail__bluesky">
      <BlueskyThread thread={data.blueskyThread} authors={authorsMap} currentUri={data.activity.externalId} />
    </div>
  {/if}

  {#if redditDetails}
    <div class="activityDetail__reddit">
      <p>
        <strong>Subreddit:</strong>
        r/{redditDetails.subreddit}
      </p>
      <p>
        <strong>Type:</strong>
        {redditDetails.itemType}
      </p>
      {#if redditDetails.body}
        <p class="activityDetail__postText">{redditDetails.body}</p>
      {/if}
      {#if redditDetails.score !== null}
        <p>
          <strong>Score:</strong>
          {redditDetails.score}
        </p>
      {/if}
    </div>
  {/if}

  {#if hnDetails}
    <div class="activityDetail__hackernews">
      <p>
        <strong>Type:</strong>
        {hnDetails.itemType}
      </p>
      {#if hnDetails.body}
        <div class="activityDetail__hnBody">{@html hnDetails.body}</div>
      {/if}
      {#if hnDetails.hnScore !== null}
        <p>
          <strong>Points:</strong>
          {hnDetails.hnScore}
        </p>
      {/if}
    </div>
  {/if}

  {#if bggDetails}
    <div class="activityDetail__bgg">
      {#if bggDetails.playDate}
        <p>
          <strong>Played:</strong>
          {bggDetails.playDate}
        </p>
      {/if}
      {#if bggDetails.location}
        <p>
          <strong>Location:</strong>
          {bggDetails.location}
        </p>
      {/if}
      {#if bggDetails.numPlayers}
        <p>
          <strong>Players:</strong>
          {bggDetails.numPlayers}
        </p>
      {/if}
      {#if bggDetails.comments}
        <div class="activityDetail__bggComments">{@html bggDetails.comments}</div>
      {/if}
      {#if bggDetails.incomplete}
        <p class="activityDetail__bggIncomplete">Game not finished</p>
      {/if}
    </div>
  {/if}

  {#if data.isAdmin}
    <div class="activityDetail__adminActions">
      <button onclick={togglePrivate}>
        {data.activity.isPrivate ? 'Make Public' : 'Make Private'}
      </button>
      <button onclick={deleteActivity} class="activityDetail__delete">Delete</button>
    </div>
  {/if}
</div>

<style>
  .activityDetail {
    max-width: 40rem;
    margin: 0 auto;
  }

  .activityDetail__back {
    display: inline-block;
    margin-bottom: 2rem;
    color: var(--subtle);
  }

  .activityDetail__header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .activityDetail__icon {
    font-size: 2rem;
  }

  .activityDetail__header h1 {
    font-family: var(--displayFont);
    font-size: 2rem;
    line-height: 1.2;
    margin: 0;
  }

  .activityDetail__private {
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    background: var(--subtle);
    border-radius: 0.25rem;
  }

  .activityDetail__meta {
    display: flex;
    gap: 1rem;
    color: var(--subtle);
    margin-bottom: 2rem;
  }

  .activityDetail__type {
    text-transform: capitalize;
  }

  .activityDetail__thumbnail {
    max-width: 300px;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .activityDetail__link {
    display: inline-block;
    margin-bottom: 2rem;
    color: var(--fg);
  }

  .activityDetail__postText {
    white-space: pre-wrap;
    line-height: 1.6;
    margin: 1rem 0;
    padding: 1rem;
    background: var(--subtle);
    border-radius: 0.5rem;
    color: var(--bg);
  }

  .activityDetail__edit {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }

  .activityDetail__edit label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .activityDetail__edit textarea {
    padding: 0.5rem;
    border: 1px solid var(--subtle);
    border-radius: 0.25rem;
    font-family: inherit;
  }

  .activityDetail__edit select {
    padding: 0.5rem;
    border: 1px solid var(--subtle);
    border-radius: 0.25rem;
  }

  .activityDetail__editActions {
    display: flex;
    gap: 0.5rem;
  }

  .activityDetail__adminActions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid var(--subtle);
  }

  .activityDetail__delete {
    color: red;
  }

  button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--subtle);
    border-radius: 0.25rem;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
  }

  button:hover {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }

  .activityDetail__plex,
  .activityDetail__github,
  .activityDetail__bluesky,
  .activityDetail__reddit,
  .activityDetail__hackernews,
  .activityDetail__bgg {
    margin: 1rem 0;
  }

  .activityDetail__plex p,
  .activityDetail__github p,
  .activityDetail__reddit p,
  .activityDetail__hackernews p,
  .activityDetail__bgg p {
    margin: 0.5rem 0;
  }

  .activityDetail__bggComments {
    line-height: 1.6;
    font-style: italic;
    margin: 1rem 0;
  }

  .activityDetail__bggComments :global(a) {
    color: var(--fg);
    text-decoration: underline;
  }

  .activityDetail__bggIncomplete {
    color: var(--subtle);
  }

  .activityDetail__hnBody {
    line-height: 1.6;
    margin: 1rem 0;
  }

  .activityDetail__hnBody :global(p) {
    margin: 0.75rem 0;
  }

  .activityDetail__hnBody :global(p:first-child) {
    margin-top: 0;
  }

  .activityDetail__hnBody :global(a) {
    color: var(--fg);
    text-decoration: underline;
  }

  .activityDetail__hnBody :global(i) {
    font-style: italic;
  }

  .activityDetail__hnBody :global(code) {
    font-family: 'BerkeleyMono', monospace;
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-size: 0.9em;
  }

  .activityDetail__hnBody :global(pre) {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 1rem 0;
  }

  .activityDetail__hnBody :global(pre code) {
    background: none;
    padding: 0;
  }
</style>
