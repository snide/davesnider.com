<script lang="ts">
  import type { Snippet } from 'svelte';
  import { formatDate } from '$lib/utils/format-date';

  type Props = {
    title: string;
    description: string;
    pubDate: string;
    tags?: string[];
    image?: string;
    ogImage?: string;
    children: Snippet;
  };

  let { title, description, pubDate, tags = [], children }: Props = $props();
</script>

<svelte:head>
  <title>{title} - Dave Snider</title>
  <meta name="description" content={description} />
</svelte:head>

<article class="post">
  <header class="post__header">
    <h1 class="post__title">{title}</h1>
    <p class="post__date">{formatDate(pubDate)}</p>
    {#if tags.length > 0}
      <ul class="post__tags">
        {#each tags as tag}
          <li class="post__tag">{tag}</li>
        {/each}
      </ul>
    {/if}
  </header>
  <div class="post__content">
    {@render children()}
  </div>
</article>

<style>
  .post {
    max-width: 720px;
    margin: 0 auto;
  }

  .post__header {
    margin-bottom: 3rem;
  }

  .post__title {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
    margin-bottom: 0.5rem;
  }

  .post__date {
    color: var(--subtle);
    font-family: var(--codeFont);
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }

  .post__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .post__tag {
    background-color: var(--fileBg);
    padding: 0.2rem 0.5rem;
    font-family: var(--codeFont);
    font-size: 0.75rem;
  }

  .post__content {
    font-size: 1.1rem;
    line-height: 1.7;
  }

  .post__content :global(p) {
    margin-bottom: 1.5rem;
  }

  .post__content :global(h2) {
    font-family: var(--displayFont);
    font-size: 2rem;
    margin-top: 3rem;
    margin-bottom: 1rem;
  }

  .post__content :global(h3) {
    font-family: var(--displayFont);
    font-size: 1.5rem;
    margin-top: 2rem;
    margin-bottom: 0.75rem;
  }

  .post__content :global(a) {
    text-decoration: underline;
  }

  .post__content :global(a:hover) {
    background-color: var(--fg);
    color: var(--bg);
  }

  .post__content :global(ul),
  .post__content :global(ol) {
    margin-bottom: 1.5rem;
    padding-left: 1.5rem;
  }

  .post__content :global(li) {
    margin-bottom: 0.5rem;
  }

  .post__content :global(li::marker) {
    color: var(--listMarker);
  }

  .post__content :global(blockquote) {
    border-left: 4px solid var(--subtle);
    padding-left: 1rem;
    margin-left: 0;
    margin-bottom: 1.5rem;
    font-style: italic;
    color: var(--subtle);
  }

  .post__content :global(pre) {
    background-color: var(--codeBg);
    padding: 1rem;
    overflow-x: auto;
    margin-bottom: 1.5rem;
    font-family: var(--codeFont);
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .post__content :global(code) {
    font-family: var(--codeFont);
    font-size: 0.9em;
  }

  .post__content :global(p code) {
    background-color: var(--codeBg);
    padding: 0.2rem 0.4rem;
  }

  .post__content :global(img) {
    max-width: 100%;
    height: auto;
    margin: 2rem auto;
    display: block;
  }

  .post__content :global(hr) {
    border: none;
    border-top: 1px solid var(--subtle);
    margin: 3rem 0;
  }

  @media (max-width: 768px) {
    .post__title {
      font-size: 2rem;
    }
  }
</style>
