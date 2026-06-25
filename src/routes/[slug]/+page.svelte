<script lang="ts">
  import { formatDate } from '$lib/utils/format-date';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const Content = $derived(data.content);
  const metadata = $derived(data.metadata);
</script>

<svelte:head>
  <title>{metadata.title} - Dave Snider</title>
  <meta name="description" content={metadata.description} />
  {#if metadata.ogImage}
    <meta property="og:image" content={metadata.ogImage} />
  {:else if metadata.image}
    <meta property="og:image" content={metadata.image} />
  {:else}
    <meta property="og:image" content="https://davesnider.com/og.png" />
  {/if}
</svelte:head>

<article class="post">
  <h1 class="post__title">{metadata.title}</h1>
  <p class="post__date">{formatDate(metadata.pubDate)}</p>
  <Content />
</article>

<style>
  .post {
    margin: 0 auto;
    font-size: 1.25rem;
    color: var(--subtle);
    min-width: 0;
  }

  .post :global(*:not([data-line]):not(:last-child)) {
    margin-bottom: 1.5rem;
  }

  .post :global(> *) {
    max-width: 40rem;
    margin-left: auto;
    margin-right: auto;
  }

  .post :global(h1),
  .post :global(h2),
  .post :global(h3),
  .post :global(h4),
  .post :global(h5),
  .post :global(h6) {
    font-family: var(--displayFont);
    color: var(--fg);
  }

  .post :global(h1) {
    font-size: 3rem;
    line-height: 1.1;
    margin-bottom: 0.5rem !important;
  }

  .post__date {
    font-family: var(--codeFont);
    font-size: 0.8rem;
  }

  .post :global(p a),
  .post :global(li a) {
    padding: 0.1rem 0.2rem;
    font-weight: 700;
    text-decoration: underline;
    color: var(--fg);
  }

  .post :global(p a:hover),
  .post :global(li a:hover) {
    background-color: var(--fg);
    color: var(--bg);
    outline: solid 2px var(--fg);
  }

  .post :global(ul) {
    padding-left: 1.5rem;
  }

  .post :global(ul li::marker) {
    color: var(--listMarker);
    content: '❖ ';
  }

  .post :global(ul li:not([data-line]):not(:last-child)) {
    margin-bottom: 0.75rem;
  }

  .post :global(p code),
  .post :global(li code) {
    background-color: var(--navBg);
    font-family: var(--codeFont);
    font-size: 0.9rem;
    word-break: break-all;
    padding: 0 0.2rem;
    display: inline-block;
    margin-bottom: 0 !important;
  }

  .post :global(blockquote) {
    border-left: solid 4px var(--listMarker);
    padding-left: 1rem;
    color: var(--listMarker);
    font-style: italic;
    font-family: var(--codeFont);
    font-size: 0.875rem;
  }

  .post :global([data-rehype-pretty-code-figure]) {
    margin: 3rem auto !important;
    max-width: 60rem !important;
    position: relative;
  }

  .post :global(pre *::selection) {
    color: var(--bg);
    background-color: var(--fg);
  }

  .post :global(pre > code) {
    font-size: 0.9rem;
    border: solid 1px var(--shiki-token-border);
    padding: 2rem 0;
    display: grid;
    font-family: 'BerkeleyMono', monospace !important;
    background-color: var(--codeBg) !important;
    max-width: 100%;
    overflow-x: auto;
  }

  .post :global(pre > code[data-language='markdown']),
  .post :global(pre > code[data-language='md']) {
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .post :global(pre > code[data-language='markdown'] > [data-line]::before),
  .post :global(pre > code[data-language='md'] > [data-line]::before) {
    display: none;
  }

  .post :global(pre > code [data-line]) {
    border-left: 0.25rem solid transparent;
    padding: 0 0.5rem;
    min-height: 1lh;
  }

  .post :global(pre > code:not([data-line-numbers]) [data-line]) {
    padding-left: 2.5rem;
  }

  .post :global(pre > code .highlighted) {
    background-color: var(--shiki-token-line-highlight);
    border-left-color: var(--fg);
  }

  .post :global(pre > code[data-line-numbers]) {
    counter-reset: line;
  }

  .post :global(pre > code[data-line-numbers] > [data-line]::before) {
    counter-increment: line;
    content: counter(line);
    display: inline-block;
    margin-right: 1rem;
    width: 2rem;
    text-align: left;
    color: var(--shiki-token-line-number);
  }

  .post :global([data-rehype-pretty-code-title]) {
    background-color: var(--shiki-token-border);
    font-family: var(--codeFont);
    font-weight: 600;
    font-size: 0.8rem;
    padding: 0.5rem 0.75rem;
    display: flex;
    margin-bottom: 0 !important;
    width: fit-content;
    color: var(--fg);
  }

  .post :global([data-rehype-pretty-code-title]::before) {
    content: '❖ ';
    color: var(--subtle);
    margin-right: 0.5rem;
  }

  .post :global(hr) {
    border: none;
    border-bottom: solid 2px var(--listMarker);
    margin: 0 auto;
    max-width: 2rem !important;
  }

  /* Breakout elements */
  .post :global(.video),
  .post :global(.videoPlayer),
  .post :global(.gallery),
  .post :global(.postImage),
  .post :global(.stlViewer),
  .post :global(video) {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
  }

  /* Page load animations - title slides down, content slides up */
  .post :global(> *:first-child) {
    opacity: 1;
    animation-duration: 0.5s;
    animation-name: slidedown;
    animation-fill-mode: both;
    animation-timing-function: ease-in-out;
  }

  .post :global(> *:not(:first-child)) {
    opacity: 1;
    animation-duration: 0.25s;
    animation-name: slideup;
    animation-fill-mode: both;
    animation-timing-function: ease-in-out;
  }

  .post :global(> *:nth-child(1)) {
    animation-delay: 100ms;
  }
  .post :global(> *:nth-child(2)) {
    animation-delay: 100ms;
  }
  .post :global(> *:nth-child(3)) {
    animation-delay: 500ms;
  }
  .post :global(> *:nth-child(4)) {
    animation-delay: 600ms;
  }
  .post :global(> *:nth-child(5)) {
    animation-delay: 700ms;
  }
  .post :global(> *:nth-child(6)) {
    animation-delay: 800ms;
  }
  .post :global(> *:nth-child(7)) {
    animation-delay: 900ms;
  }
  .post :global(> *:nth-child(8)) {
    animation-delay: 1000ms;
  }
  .post :global(> *:nth-child(9)) {
    animation-delay: 1100ms;
  }
  .post :global(> *:nth-child(10)) {
    animation-delay: 1200ms;
  }
  .post :global(> *:nth-child(n + 11)) {
    animation-delay: 1300ms;
  }

  @keyframes slideup {
    from {
      opacity: 0;
      transform: translateY(3rem);
    }
    to {
      opacity: 1;
    }
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
    .post :global(h1) {
      font-size: 2rem;
    }
  }
</style>
