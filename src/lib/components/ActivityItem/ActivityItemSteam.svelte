<script lang="ts">
  import type { SteamDetailWithSession } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';

  interface Props {
    details: SteamDetailWithSession;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide }: Props = $props();

  let steamUrl = $derived(details ? `https://store.steampowered.com/app/${details.appId}` : '');
  let achievements = $derived(details?.achievements || []);
  let achievementCount = $derived(achievements.length);

  function formatPlaytime(minutes: number): string {
    if (minutes < 60) {
      return `Played for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hoursLabel = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    if (mins === 0) {
      return `Played for ${hoursLabel}`;
    }
    return `Played for ${hoursLabel}, and ${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  }

  let playtimeLabel = $derived(
    details?.playtimeSession != null && details.playtimeSession > 0 ? formatPlaytime(details.playtimeSession) : null
  );
</script>

<ActivityItem type="steam" {timestamp} {isPrivate} {isAdmin} {onHide}>
  {#if details}
    <div class="steamBody">
      {#if details.gamePosterUrl}
        <a href={steamUrl} target="_blank" rel="noopener noreferrer">
          <img src={details.gamePosterUrl} alt="" class="steamBody__poster" />
        </a>
      {/if}
      <div class="steamBody__content">
        <div class="steamBody__titleRow">
          <a href={steamUrl} target="_blank" rel="noopener noreferrer" class="steamBody__title">
            {details.gameTitle}{#if details.gameYear}&nbsp;({details.gameYear}){/if}
          </a>
          {#if details.gameDeveloper}
            <span class="steamBody__developer">by {details.gameDeveloper}</span>
          {/if}
        </div>

        {#if playtimeLabel}
          <div class="steamBody__playtime">{playtimeLabel}</div>
        {/if}

        {#if achievementCount > 0}
          <div class="steamBody__achievements">
            {#each achievements as achievement}
              <div class="steamBody__achievement">
                {#if achievement.iconUrl}
                  <img src={achievement.iconUrl} alt="" class="steamBody__achievementIcon" />
                {/if}
                <div class="steamBody__achievementContent">
                  <div class="steamBody__achievementName">{achievement.name}</div>
                  {#if achievement.description}
                    <div class="steamBody__achievementDesc">{achievement.description}</div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</ActivityItem>

<style>
  .steamBody {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .steamBody__poster {
    width: 6rem;
    height: auto;
    flex-shrink: 0;
  }

  .steamBody__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .steamBody__titleRow {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .steamBody__title {
    font-weight: 600;
    line-height: 1.4;
    text-decoration: none;
    color: var(--fg);
  }

  .steamBody__title:hover {
    text-decoration: underline;
  }

  .steamBody__developer {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .steamBody__playtime {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .steamBody__achievements {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border: 1px solid var(--border);
    overflow: hidden;
    padding-top: 0.5rem;
  }

  .steamBody__achievement {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--bg-secondary);
  }

  .steamBody__achievement:not(:last-child) {
    border-bottom: 1px solid var(--border);
  }

  .steamBody__achievementIcon {
    width: 3rem;
    height: 3rem;
    object-fit: cover;
    flex-shrink: 0;
  }

  .steamBody__achievementContent {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .steamBody__achievementName {
    font-weight: 500;
    line-height: 1.3;
  }

  .steamBody__achievementDesc {
    color: var(--subtle);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  @media (max-width: 768px) {
    .steamBody {
      display: block;
    }

    .steamBody__poster {
      float: left;
      margin-right: 1rem;
      margin-bottom: 0.5rem;
      width: 5rem;
    }

    .steamBody__content {
      display: block;
    }

    .steamBody__achievementIcon {
      width: 48px;
      height: 48px;
    }
  }
</style>
