<script lang="ts">
  import type { SelectActivityPlex, PlexEpisode } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';
  import StarRating from '$lib/components/StarRating/StarRating.svelte';

  interface Props {
    activityId: number;
    details: SelectActivityPlex;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
    onEpisodeRatingUpdate?: (episodeIndex: number, rating: number | null) => void;
  }

  let { activityId, details, timestamp, isPrivate, isAdmin, onHide, onEpisodeRatingUpdate }: Props = $props();

  let episodes = $derived((details.episodes || []) as PlexEpisode[]);
  let savingIndex = $state<number | null>(null);

  async function updateEpisodeRating(index: number, rating: number | null) {
    savingIndex = index;
    try {
      const res = await fetch(`/api/activity/plex/${activityId}/episode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeIndex: index, rating })
      });
      if (res.ok) {
        // Update local state
        const ep = episodes[index];
        if (ep) {
          ep.rating = rating || undefined;
        }
        onEpisodeRatingUpdate?.(index, rating);
      }
    } finally {
      savingIndex = null;
    }
  }

  function formatEpisodeCode(season: number, episode: number): string {
    return `S${season}.E${episode}`;
  }
</script>

<ActivityItem type="plex" {timestamp} {isPrivate} {isAdmin} {onHide}>
  <div class="plexTV">
    {#if details.thumbnailUrl}
      {#if details.imdbUrl}
        <a href={details.imdbUrl} target="_blank" rel="noopener noreferrer">
          <img src={details.thumbnailUrl} alt="" class="plexTV__poster" />
        </a>
      {:else}
        <img src={details.thumbnailUrl} alt="" class="plexTV__poster" />
      {/if}
    {/if}
    <div class="plexTV__content">
      <div class="plexTV__titleRow">
        {#if details.imdbUrl}
          <a href={details.imdbUrl} target="_blank" rel="noopener noreferrer" class="plexTV__title">
            {details.title}{#if details.year}&nbsp;({details.year}){/if}
          </a>
        {:else}
          <span class="plexTV__title">
            {details.title}{#if details.year}&nbsp;({details.year}){/if}
          </span>
        {/if}
      </div>

      {#if episodes.length > 0}
        <div class="plexTV__episodes">
          {#each episodes as ep, i}
            <div class="plexTV__episode">
              <a
                href={`https://www.imdb.com/title/${ep.imdbId}/`}
                target="_blank"
                rel="noopener noreferrer"
                class="plexTV__episodeLink"
              >
                {#if ep.posterUrl}
                  <img src={ep.posterUrl} alt="" class="plexTV__episodeThumb" />
                {/if}
                <div class="plexTV__episodeInfo">
                  <span class="plexTV__episodeCode">{formatEpisodeCode(ep.season, ep.episode)}</span>
                  <span class="plexTV__episodeTitle">{ep.title}</span>
                </div>
              </a>
              <div class="plexTV__episodeRating">
                {#if isAdmin}
                  <StarRating
                    rating={ep.rating || 0}
                    isEditing={savingIndex !== i}
                    onRate={(r) => updateEpisodeRating(i, r)}
                  />
                {:else if ep.rating}
                  <StarRating rating={ep.rating} />
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</ActivityItem>

<style>
  .plexTV {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .plexTV__poster {
    width: 6rem;
    height: auto;
    flex-shrink: 0;
  }

  .plexTV__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .plexTV__titleRow {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .plexTV__title {
    font-weight: 600;
    line-height: 1.4;
    text-decoration: none;
  }

  .plexTV__title:hover {
    text-decoration: underline;
  }

  .plexTV__episodes {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border: 1px solid var(--border);
    overflow: hidden;
    padding-top: 0.5rem;
  }

  .plexTV__episode {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--bg-secondary);
  }

  .plexTV__episode:not(:last-child) {
    border-bottom: 1px solid var(--border);
  }

  .plexTV__episodeLink {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
    text-decoration: none;
    color: inherit;
  }

  .plexTV__episodeLink:hover .plexTV__episodeTitle {
    text-decoration: underline;
  }

  .plexTV__episodeThumb {
    width: 4rem;
    height: 2.25rem;
    object-fit: cover;
    flex-shrink: 0;
  }

  .plexTV__episodeInfo {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .plexTV__episodeCode {
    font-weight: 500;
    font-size: 0.75rem;
    color: var(--subtle);
  }

  .plexTV__episodeTitle {
    font-size: 0.875rem;
    line-height: 1.3;
  }

  .plexTV__episodeRating {
    flex-shrink: 0;
    padding-right: 0.5rem;
  }

  @media (max-width: 768px) {
    .plexTV {
      display: block;
    }

    .plexTV__poster {
      float: left;
      margin-right: 1rem;
      margin-bottom: 0.5rem;
      width: 5rem;
    }

    .plexTV__content {
      display: block;
    }

    .plexTV__episodeThumb {
      width: 3rem;
      height: 1.75rem;
    }
  }
</style>
