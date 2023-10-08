<script lang="ts">
  import { onMount } from 'svelte';
  export let id: string;
  import { type FilesRecordWithThumbs } from '@localTypes/files';
  import ColorBand from './color-band.svelte';
  import { bytesToSize } from '@lib/bytes-to-size';
  let fileRecord: FilesRecordWithThumbs;
  let isLoading = false;

  async function fetchFileRecord() {
    isLoading = true;
    const response = await fetch(`/api/file/transform/scale-down/1200/1200/${id}`, {
      method: 'GET'
    });
    console.log('response', response);
    fileRecord = await response.json();
    console.log('this works', fileRecord);
  }

  onMount(async () => {
    fetchFileRecord();
  });
</script>

{#if fileRecord}
  <img src={fileRecord.file.thumb?.url} alt={fileRecord.file.url} loading="lazy" class="bg" />
  <div class="layout">
    <main>
      {#if fileRecord.file && fileRecord.file.thumb}
        <img
          src={fileRecord.file.thumb?.url}
          width={fileRecord.file.thumb?.attributes.width}
          height={fileRecord.file.thumb?.attributes.height}
          alt={fileRecord.file.name}
        />
      {:else}
        <img src={fileRecord.file.url} alt={fileRecord.file.name} />
      {/if}
      <p class="text">{fileRecord.textContent}</p>
    </main>
    <aside>
      <h1>{fileRecord.id}</h1>
      <p>{new Date(fileRecord.originalUploadDate).toLocaleDateString()}</p>
      <ColorBand colorsData={fileRecord.visionImageProperties.dominantColors} />
      <p>{bytesToSize(fileRecord.file.size)}</p>
      <p>
        <a href={fileRecord.file.thumb?.url}
          >{fileRecord.file.attributes.width}x{fileRecord.file.attributes.height} (original)</a
        >
      </p>
      <div class="labels">
        {#each fileRecord.visionLabel as label}
          <div class="label">{label.description}</div>
        {/each}
      </div>
    </aside>
  </div>
{:else}
  <div>Loading...</div>
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
    justify-content: center;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  img {
    justify-self: center;
    width: auto;
    height: auto;
  }

  aside {
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
  }
  aside p {
    font-family: var(--codeFont);
    color: var(--subtle);
    font-size: 0.8rem;
  }
  aside a {
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
    opacity: 0.2;
  }
</style>
