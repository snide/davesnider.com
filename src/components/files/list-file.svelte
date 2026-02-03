<script lang="ts">
  import type { FileRecordWithThumb } from '@lib/image';
  export let fileRecord: FileRecordWithThumb | undefined = undefined;
  export let isLoggedIn: boolean = false;
  export let isSkeleton: boolean = false;
  export let updateFileRecord = (id: string, fileRecord: FileRecordWithThumb | null) => {};

  // Dynamically import STL viewer only when needed
  let StlViewer: any = null;
  $: if (fileRecord?.fileTypeCategory === 'model' && !StlViewer) {
    import('@components/stl/stl-viewer.svelte').then(module => {
      StlViewer = module.default;
    });
  }

  // Track click vs drag for STL viewer
  let mouseDownPos = { x: 0, y: 0 };
  let isDragging = false;
  const DRAG_THRESHOLD = 5;

  function handleStlMouseDown(e: MouseEvent) {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    isDragging = false;
  }

  function handleStlMouseUp(e: MouseEvent) {
    const dx = Math.abs(e.clientX - mouseDownPos.x);
    const dy = Math.abs(e.clientY - mouseDownPos.y);
    if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
      // It was a click, not a drag - navigate to detail page
      window.location.href = `/file/${fileRecord?.fileId}`;
    }
  }

  async function handleFileAction(id: string, action: 'hide' | 'favorite' | 'unfavorite' | 'unhide' | 'delete') {
    const response = await fetch(`/api/file/${action}/${id}`, {
      method: 'POST'
    });

    if (response.ok) {
      if (action === 'delete') {
        updateFileRecord(id, null);
      } else {
        // Fetch the updated record
        const updatedRecordResponse = await fetch(`/api/file/${id}`, { method: 'POST' });
        const updatedFileRecord = await updatedRecordResponse.json();
        if (updatedRecordResponse.ok) {
          updateFileRecord(id, updatedFileRecord);
        } else {
          console.error('Error fetching updated file record');
        }
      }
    } else {
      console.error('Error');
    }
  }

  let mediaLoaded = false;
  let videoRetryCount = 0;
  let videoKey = 0;

  const handleLoaded = () => {
    mediaLoaded = true;
  };

  const handleVideoError = (e: Event) => {
    if (videoRetryCount < 2) {
      videoRetryCount++;
      videoKey++; // Force video element recreation
    }
  };

  const formattedDate =
    fileRecord && fileRecord.originalUploadDate ? new Date(fileRecord?.originalUploadDate).toISOString() : undefined;
</script>

{#if isSkeleton}
  <figure>
    <div class="skeleton-image"></div>
  </figure>
{/if}

{#if fileRecord}
  <figure class={fileRecord.isHidden ? 'hidden' : ''} data-date={formattedDate}>
    {#if fileRecord.fileTypeCategory === 'video'}
      <div class="video">
        {#key `${fileRecord.url}-${videoKey}`}
          <video controls preload="metadata" on:error={handleVideoError}>
            <source src={`https://files.davesnider.com/${fileRecord.url}`} type="video/mp4" />
          </video>
        {/key}
        <a href={`/file/${fileRecord.fileId}`}>Video link</a>
      </div>
    {:else if fileRecord.fileTypeCategory === 'image'}
      <a href={`/file/${fileRecord.fileId}`}>
        <img
          src={fileRecord.thumb?.resizedUrl || fileRecord.thumb?.url}
          height={fileRecord.thumb?.details?.height || 'auto'}
          width={fileRecord.thumb?.details?.width || 'auto'}
          loading="lazy"
          alt={fileRecord.fileId}
          class={mediaLoaded ? 'fadeIn' : ''}
          on:load={handleLoaded}
        />
      </a>
    {:else if fileRecord.fileTypeCategory === 'model'}
      <div
        class="stl-wrapper"
        role="button"
        tabindex="0"
        on:mousedown={handleStlMouseDown}
        on:mouseup={handleStlMouseUp}
        on:keydown={(e) => e.key === 'Enter' && (window.location.href = `/file/${fileRecord.fileId}`)}
      >
        {#if StlViewer}
          <svelte:component this={StlViewer} url={`https://files.davesnider.com/${fileRecord.url}`} height="100%" />
        {:else}
          <div class="stl-loading">Loading 3D...</div>
        {/if}
      </div>
    {:else}
      <a href={`/file/${fileRecord.fileId}`}>
        {#if !fileRecord.url}
          <!--  I think there's an issue with large gif files in search results  -->
          <code>{fileRecord.fileTypeCategory} thumbnail issue</code>
        {:else}
          <img
            src={fileRecord.thumb?.url}
            loading="lazy"
            alt={fileRecord.fileId}
            class={mediaLoaded ? 'fadeIn' : ''}
            on:load={handleLoaded}
          />
        {/if}
      </a>
    {/if}
    {#if isLoggedIn && fileRecord.id}
      <div class="actions">
        {#if !fileRecord.isHidden}
          <button on:click={() => handleFileAction(fileRecord.fileId, 'hide')}>Hide</button>
        {:else if fileRecord.isHidden}
          <button on:click={() => handleFileAction(fileRecord.fileId, 'unhide')}>Unhide</button>
        {/if}
        {#if !fileRecord.isFavorite}
          <button on:click={() => handleFileAction(fileRecord.fileId, 'favorite')}>fav</button>
        {:else if fileRecord.isFavorite}
          <button on:click={() => handleFileAction(fileRecord.fileId, 'unfavorite')}>unfav</button>
        {/if}
        <button on:click={() => handleFileAction(fileRecord.fileId, 'delete')}>Delete</button>
      </div>
    {/if}
  </figure>
{/if}

<style>
  img,
  video {
    transition: all 0.2s ease-in-out;
    object-fit: contain;
    max-width: 100%;
    max-height: 100%;
    object-position: center;
  }
  video {
    width: 100%;
  }

  figure {
    list-style: none;
    background-color: var(--fileBg);
    position: relative;
    display: flex; /* Add this */
    align-items: center; /* Add this to center vertically */
    justify-content: center; /* Add this to center horizontally */
  }

  figure::before {
    content: '';
    display: block;
    padding-top: 100%;
  }

  figure img,
  figure .video {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex; /* Add this */
    align-items: center; /* Add this to center content vertically */
    justify-content: center; /* Add this to center content horizontally */
  }

  figure img {
    transition: all 1s cubic-bezier(0.19, 1, 0.22, 1);
    opacity: 0;
  }

  .video {
    flex-direction: column;
  }
  .video a {
    display: inline-block;
    text-decoration: underline;
    font-family: var(--codeFont);
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }

  figure:hover {
    background-color: var(--fileHoverBg);
    z-index: 1;
  }

  figure:hover {
    opacity: 1;
  }

  figure:hover img,
  figure:hover .video {
    filter: brightness(1) grayscale(0%);
  }

  figure:hover .actions {
    visibility: visible;
    opacity: 1;
  }
  .actions {
    position: absolute;
    top: 0;
    display: flex;
    width: 100%;
    gap: 0.5rem;
    z-index: 2;
    padding: 0.5rem;
    visibility: hidden;
    opacity: 0;
    transition: all 0.1s ease-in-out;
    transition-delay: 0.4s;
    justify-content: center;
  }
  .actions button {
    background-color: var(--fileBg);
    color: var(--subtle);
    border: solid 1px var(--bg);
    box-shadow:
      0 1px 1px rgba(0, 0, 0, 0.04),
      0 2px 2px rgba(0, 0, 0, 0.06);
    font-family: var(--codeFont);
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
  }
  .actions button:hover {
    color: var(--bg);
    background-color: var(--fg);
    text-decoration: underline;
  }
  .hidden img,
  .hidden video {
    opacity: 0.1 !important;
  }
  .fadeIn {
    animation: fadeIn 0.2s ease-out;
    animation-fill-mode: both;
  }

  .stl-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
    cursor: pointer;
  }

  .stl-wrapper :global(.stl-container) {
    background-color: var(--fileBg);
  }

  .stl-loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--subtle);
    font-family: var(--codeFont);
    font-size: 0.8rem;
  }
</style>
