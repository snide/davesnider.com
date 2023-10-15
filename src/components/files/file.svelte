<script lang="ts">
  import { onMount } from 'svelte';
  export let id: string;
  import { type FilesRecordWithThumbs } from '@localTypes/files';
  import ColorBand from './color-band.svelte';
  import { bytesToSize } from '@lib/bytes-to-size';
  import Loader from '@components/loader.svelte';
  let fileRecord: FilesRecordWithThumbs;
  import AnimatedFile from '@components/files/animated-file.svelte';
  let isLoading = false;

  async function fetchFileRecord() {
    isLoading = true;
    const response = await fetch(`/api/file/transform/scale-down/1200/1200/${id}`, {
      method: 'GET',
      credentials: 'include'
    });

    console.log('status', response.status);

    console.log('response', response);
    fileRecord = await response.json();
    console.log('this works', fileRecord);
    isLoading = false;
  }

  onMount(async () => {
    fetchFileRecord();
  });
</script>

{#if fileRecord && fileRecord.file}
  {#if fileRecord.fileTypeCategory === 'image' && fileRecord.file.thumb}
    <img src={fileRecord.file.thumb.url} alt={fileRecord.file.url} class="bg" />
  {/if}
  <div class="layout">
    <main>
      {#if fileRecord.fileTypeCategory === 'video'}
        <AnimatedFile type="video" src={fileRecord.file.url} />
      {:else if fileRecord.file && fileRecord.file.thumb}
        <AnimatedFile
          src={fileRecord.file.thumb?.url}
          width={fileRecord.file.thumb?.attributes.width}
          height={fileRecord.file.thumb?.attributes.height}
          alt={fileRecord.file.name}
        />
      {:else}
        <AnimatedFile
          src={fileRecord.file.url}
          alt={fileRecord.file.name}
          width={fileRecord.file.attributes.width}
          height={fileRecord.file.attributes.height}
        />
      {/if}
    </main>
    <aside>
      <h1>{fileRecord?.id}</h1>
      <p>{new Date(fileRecord.originalUploadDate).toLocaleDateString()}</p>
      {#if fileRecord.visionImageProperties && fileRecord.visionImageProperties.dominantColors.colors.length > 0}
        <div>
          <ColorBand colorsData={fileRecord.visionImageProperties.dominantColors} />
        </div>
      {/if}
      <p>{bytesToSize(fileRecord.file.size)}</p>
      {#if fileRecord.fileTypeCategory === 'image' && fileRecord.file.attributes}
        <p>
          <a href={fileRecord.file.url}
            >{fileRecord.file.attributes.width}x{fileRecord.file.attributes.height} (original)</a
          >
        </p>
      {/if}
      {#if fileRecord.visionLabel && fileRecord.visionLabel.length > 0}
        <div class="labels">
          {#each fileRecord.visionLabel as label}
            <a class="label" href={`/museum/?searchTerm=${label.description}`}>{label.description}</a>
          {/each}
        </div>
      {/if}

      {#if fileRecord.textContent}
        <p class="text">{fileRecord.textContent}</p>
      {/if}
    </aside>
  </div>
{:else}
  <Loader />
{/if}

<style>
  .layout {
    width: 100%;
    display: flex;
    gap: 3rem;
  }

  main {
    flex-grow: 1;
    display: flex;
    justify-content: start;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  img {
    justify-self: center;
    width: auto;
    height: auto;
    animation: slideup 0.2s ease-in-out;
    animation-fill-mode: both;
  }

  aside {
    width: 300px;
    min-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  aside > * {
    animation: slideup 0.2s ease-in-out;
    animation-fill-mode: both;
    animation-delay: 200ms;
  }

  aside > *:nth-child(1) {
    animation-delay: 200ms;
  }

  aside > *:nth-child(2) {
    animation-delay: 300ms;
  }

  aside > *:nth-child(3) {
    animation-delay: 400ms;
  }

  aside > *:nth-child(4) {
    animation-delay: 500ms;
  }

  aside > *:nth-child(5) {
    animation-delay: 600ms;
  }

  aside > *:nth-child(6) {
    animation-delay: 700ms;
  }

  aside > *:nth-child(7) {
    animation-delay: 800ms;
  }

  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .label {
    line-height: 1rem;
    background-color: var(--fileBg);
    padding: 0.1rem 0.2rem;
    font-family: var(--codeFont);
    font-size: 0.7rem;
    white-space: nowrap;
    text-transform: uppercase;
  }

  .text {
    color: var(--subtle);
    max-width: 80ch;
    max-height: 13rem;
    overflow: hidden;
    position: relative;
    mask-image: linear-gradient(0deg, transparent 0px, red 5rem);
  }

  aside p {
    font-family: var(--codeFont);
    color: var(--subtle);
    font-size: 0.8rem;
  }
  aside p a {
    color: var(--fg);
    text-decoration: underline;
  }
  aside a:hover {
    text-decoration: underline;
  }

  .bg {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    object-fit: cover;
    background-position: center;
    filter: blur(100px) brightness(1);
    opacity: 0;
    animation: imageFade 2s ease-in;
    animation-delay: 0.5s;
    animation-fill-mode: forwards;
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
  @keyframes imageFade {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 0.2;
    }
  }

  @media (max-width: 768px) {
    .layout {
      flex-direction: column;
    }
    aside {
      min-width: 100%;
      width: 100%;
    }
  }
</style>
