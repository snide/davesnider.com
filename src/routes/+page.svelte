<script lang="ts">
  import type { PageData } from './$types';
  import { animate } from '$lib/actions/animate';
  import { formatRelativeTime } from '$lib/utils/format-date';
  import TeaserSection from '$lib/components/Home/TeaserSection.svelte';
  import TeaserItem from '$lib/components/Home/TeaserItem.svelte';
  import MuseumTeaser from '$lib/components/Home/MuseumTeaser.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Dave Snider</title>
  <meta
    name="description"
    content="Dave Snider is a chaotic good web designer based out of Annapolis, MD that builds in the browser."
  />
</svelte:head>

<div class="homePage">
  <div class="homePage__hello">
    <h1 class="homePage__title">
      Hello, I'm <a href="/about">Dave</a>
    </h1>
  </div>
  <div class="homePage__columns">
    <div class="homePage__posts">
      {#each data.posts as post (post.slug)}
        <a href={`/${post.slug}`} class="homePage__feedItem" use:animate>
          <h2>{post.metadata.title}</h2>
          <p>{post.metadata.description}</p>
        </a>
      {/each}
    </div>
    <aside class="homePage__sidebar">
      {#if data.museumItem}
        <TeaserSection title="Museum" href="/museum">
          <MuseumTeaser item={data.museumItem} />
        </TeaserSection>
      {/if}
      {#if data.mergedPr}
        <TeaserSection title="Last merged PR" href="/activity?type=github">
          <TeaserItem
            href={data.mergedPr.url ?? '/activity?type=github'}
            external={Boolean(data.mergedPr.url)}
            title={data.mergedPr.title ?? `${data.mergedPr.repo}#${data.mergedPr.prNumber}`}
            meta={`${data.mergedPr.repo} · ${formatRelativeTime(data.mergedPr.timestamp)}`}
          />
        </TeaserSection>
      {/if}
      {#if data.movies.length}
        <TeaserSection title="Movies" href="/activity?type=plex">
          {#each data.movies as movie (movie.id)}
            <TeaserItem
              href={movie.imdbUrl ?? '/activity?type=plex'}
              external={Boolean(movie.imdbUrl)}
              title={movie.title ? `${movie.title}${movie.year ? ` (${movie.year})` : ''}` : 'Untitled'}
              meta={formatRelativeTime(movie.timestamp)}
              thumbnailUrl={movie.thumbnailUrl}
            />
          {/each}
        </TeaserSection>
      {/if}
      {#if data.shows.length}
        <TeaserSection title="TV shows" href="/activity?type=plex">
          {#each data.shows as show (show.id)}
            <TeaserItem
              href={show.imdbUrl ?? '/activity?type=plex'}
              external={Boolean(show.imdbUrl)}
              title={show.title ? `${show.title}${show.year ? ` (${show.year})` : ''}` : 'Untitled'}
              meta={formatRelativeTime(show.timestamp)}
              thumbnailUrl={show.thumbnailUrl}
            />
          {/each}
        </TeaserSection>
      {/if}
      {#if data.games.length}
        <TeaserSection title="Video games" href="/activity?type=steam">
          {#each data.games as game (game.appId)}
            <TeaserItem
              href={`https://store.steampowered.com/app/${game.appId}`}
              external
              title={game.title}
              meta={formatRelativeTime(game.timestamp)}
              thumbnailUrl={game.thumbnailUrl}
            />
          {/each}
        </TeaserSection>
      {/if}
      {#if data.boardGames.length}
        <TeaserSection title="Board games" href="/activity?type=bgg">
          {#each data.boardGames as boardGame (boardGame.id)}
            <TeaserItem
              href={`https://boardgamegeek.com/boardgame/${boardGame.gameId}`}
              external
              title={boardGame.title ?? 'Untitled'}
              meta={`${formatRelativeTime(boardGame.timestamp)}${boardGame.won ? ' · Won' : ''}`}
              thumbnailUrl={boardGame.thumbnailUrl}
            />
          {/each}
        </TeaserSection>
      {/if}
    </aside>
  </div>
</div>

<style>
  .homePage {
    max-width: 64rem;
    margin: 0 auto;
    padding-left: 2rem;
  }

  .homePage__columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    gap: 3rem;
    align-items: start;
  }

  .homePage__sidebar {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .homePage__feedItem {
    display: block;
    padding: 1.25rem 0;
    position: relative;
  }

  .homePage__feedItem:hover h2,
  .homePage__feedItem:focus h2 {
    background-color: var(--fg);
    color: var(--bg);
    outline: solid 4px var(--fg);
  }

  .homePage__feedItem p {
    margin-top: 0.375rem;
    font-size: 0.875rem;
    color: var(--subtle);
  }

  .homePage__feedItem h2 {
    display: inline;
    font-size: 1.125rem;
    line-height: 1.2;
  }

  .homePage__title {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1;
    margin-bottom: 3rem !important;
    opacity: 1;
    animation-duration: 0.25s;
    animation-name: slidedown !important;
    animation-fill-mode: both;
    animation-timing-function: ease-in-out;
  }

  .homePage__hello a {
    text-decoration: underline;
  }

  .homePage__hello a:hover,
  .homePage__hello a:focus {
    background-color: var(--fg);
    color: var(--bg);
    outline: solid 4px var(--fg);
  }

  @keyframes slidedown {
    from {
      opacity: 0;
      transform: translateY(-3rem);
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .homePage {
      padding-left: 0;
    }
    .homePage__columns {
      grid-template-columns: 1fr;
      gap: 2rem;
    }
  }
</style>
