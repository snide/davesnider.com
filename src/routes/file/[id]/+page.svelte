<script lang="ts">
  import type { PageData } from './$types';
  import { ColorBand } from '$lib/components/File';
  import { StlViewer } from '$lib/components/StlViewer';

  let { data }: { data: PageData } = $props();

  const pageTitle = $derived(`${data.file.fileId} - Dave Snider`);
  const description = 'From the museum: screenshots and video from the career of Dave Snider.';
  const fileUrl = $derived(`https://files.davesnider.com/${data.file.url}`);
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  {#if data.file.fileTypeCategory === 'video'}
    <meta property="og:type" content="video.other" />
    <meta property="og:video" content={fileUrl} />
    <meta property="og:video:secure_url" content={fileUrl} />
    <meta property="og:video:type" content="video/mp4" />
  {:else if data.file.fileTypeCategory === 'image'}
    <meta property="og:type" content="website" />
    <meta property="og:image" content={data.image.resizedUrl} />
    <meta property="og:image:alt" content={data.file.fileId} />
    {#if data.image.details}
      <meta property="og:image:width" content={String(data.image.details.width)} />
      <meta property="og:image:height" content={String(data.image.details.height)} />
    {/if}
  {:else}
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://davesnider.com/og.png" />
  {/if}
  <meta name="robots" content="noindex" />
</svelte:head>

{#if data.isModel}
  <div class="filePage filePage--stl">
    <main class="filePage__main">
      <StlViewer src={data.stlUrl} height="500px" />
    </main>
    <aside class="filePage__aside">
      <h1 class="filePage__title">{data.file.fileId}</h1>
      {#if data.file.originalUploadDate}
        <p class="filePage__date">
          {new Date(data.file.originalUploadDate).toLocaleDateString()}
        </p>
      {/if}
    </aside>
  </div>
{:else}
  <div class="filePage">
    <main class="filePage__main">
      <a href={data.image.url} target="_blank" rel="noopener noreferrer">
        <img src={data.image.resizedUrl} alt={data.file.fileId} class="filePage__image" loading="lazy" />
      </a>
    </main>
    <aside class="filePage__aside">
      <h1 class="filePage__title">{data.file.fileId}</h1>
      {#if data.file.originalUploadDate}
        <p class="filePage__date">
          {new Date(data.file.originalUploadDate).toLocaleDateString()}
        </p>
      {/if}
      {#if data.file.dominantColors && data.file.dominantColors.length > 0}
        <ColorBand colors={data.file.dominantColors} />
      {/if}
      {#if data.image.details?.original}
        <p class="filePage__dimensions">
          <a href={data.image.url}>
            {data.image.details.original.width}x{data.image.details.original.height} (original)
          </a>
        </p>
      {/if}
      {#if data.file.visionLabel && data.file.visionLabel.length > 0}
        <div class="filePage__labels">
          {#each data.file.visionLabel as label}
            <a class="filePage__label" href={`/museum/?searchTerm=${label.description}`}>{label.description}</a>
          {/each}
        </div>
      {/if}
      {#if data.file.textContent}
        <p class="filePage__text">{data.file.textContent}</p>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .filePage {
    width: 100%;
    display: flex;
    gap: 3rem;
  }

  .filePage__main {
    flex-grow: 1;
    display: flex;
    justify-content: start;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .filePage__aside {
    width: 300px;
    min-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .filePage__image {
    width: auto;
    height: auto;
    max-width: 100%;
    animation: slideup 0.2s ease-in-out;
    animation-fill-mode: both;
  }

  .filePage__aside > * {
    animation: slideup 0.2s ease-in-out;
    animation-fill-mode: both;
  }

  .filePage__aside > *:nth-child(1) {
    animation-delay: 200ms;
  }
  .filePage__aside > *:nth-child(2) {
    animation-delay: 300ms;
  }
  .filePage__aside > *:nth-child(3) {
    animation-delay: 400ms;
  }
  .filePage__aside > *:nth-child(4) {
    animation-delay: 500ms;
  }
  .filePage__aside > *:nth-child(5) {
    animation-delay: 600ms;
  }
  .filePage__aside > *:nth-child(6) {
    animation-delay: 700ms;
  }
  .filePage__aside > *:nth-child(7) {
    animation-delay: 800ms;
  }

  .filePage__title {
    font-family: var(--codeFont);
    font-size: 1.2rem;
  }

  .filePage__date,
  .filePage__dimensions {
    font-family: var(--codeFont);
    color: var(--subtle);
    font-size: 0.8rem;
  }

  .filePage__dimensions a {
    color: var(--fg);
    text-decoration: underline;
  }

  .filePage__labels {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .filePage__label {
    line-height: 1rem;
    background-color: var(--fileBg);
    padding: 0.1rem 0.2rem;
    font-family: var(--codeFont);
    font-size: 0.7rem;
    white-space: nowrap;
    text-transform: uppercase;
  }

  .filePage__label:hover {
    text-decoration: underline;
  }

  .filePage__text {
    color: var(--subtle);
    font-family: var(--codeFont);
    font-size: 0.8rem;
    max-width: 80ch;
    max-height: 13rem;
    overflow: hidden;
    position: relative;
    mask-image: linear-gradient(0deg, transparent 0px, red 5rem);
  }

  @keyframes slideup {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(1rem);
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .filePage {
      flex-direction: column;
    }
    .filePage__aside {
      min-width: 100%;
      width: 100%;
    }
  }
</style>
