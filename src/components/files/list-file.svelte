<script lang="ts">
  import { type FilesRecordWithThumbs } from '@localTypes/files';
  export let fileRecord: FilesRecordWithThumbs | undefined = undefined;
  export let isLoggedIn: boolean = false;
  export let isSkeleton: boolean = false;
  export let updateFileRecord = (id: string, fileRecord: FilesRecordWithThumbs | null) => {};

  async function handleFileAction(id: string, action: 'hide' | 'favorite' | 'unfavorite' | 'unhide' | 'delete') {
    const response = await fetch(`/api/file/${action}/${id}`, {
      method: 'POST'
    });

    if (response.ok) {
      console.log(`File ${action}d`);

      if (action === 'delete') {
        // Remove the file from the DOM
        updateFileRecord(id, null);
      }

      // Fetch the updated record
      const updatedRecordResponse = await fetch(`/api/file/transform/contain/600/600/${id}`);
      const updatedFileRecord = await updatedRecordResponse.json();
      if (updatedRecordResponse.ok) {
        updateFileRecord(id, updatedFileRecord);
      } else {
        console.error('Error fetching updated file record');
      }
    } else {
      console.error('Error');
    }
  }

  let mediaLoaded = false;

  const handleLoaded = () => {
    mediaLoaded = true;
  };
</script>

{#if isSkeleton}
  <figure>
    <div class="skeleton-image" />
  </figure>
{/if}

{#if fileRecord}
  <figure class={fileRecord.isHidden ? 'hidden' : ''} data-date={fileRecord.originalUploadDate}>
    {#if fileRecord.fileTypeCategory === 'video'}
      <div on:load={handleLoaded} class={'video ' + mediaLoaded ? 'fadeIn' : ''}>
        <video src={fileRecord.file.url} controls />
        <a href={`/file/${fileRecord.id}`}>{fileRecord.id}</a>
      </div>
    {:else if fileRecord.file && fileRecord.file.thumb}
      <a href={`/file/${fileRecord.id}`}>
        <img
          src={fileRecord.file.thumb.url}
          height={fileRecord.file.thumb.attributes.height}
          width={fileRecord.file.thumb.attributes.width}
          loading="lazy"
          alt={fileRecord.file.name}
          class={mediaLoaded ? 'fadeIn' : ''}
          on:load={handleLoaded}
        />
      </a>
    {:else}
      <a href={`/file/${fileRecord.id}`}>
        {#if !fileRecord.file.url}
          <!--  I think there's an issue with large gif files in search results  -->
          <code>{fileRecord.file.mediaType} search issue</code>
        {:else}
          <img src={fileRecord.file.url} loading="lazy" alt={fileRecord.file.name} />
        {/if}
      </a>
    {/if}
    {#if isLoggedIn && fileRecord.id}
      <div class="actions">
        {#if !fileRecord.isHidden}
          <button on:click={() => handleFileAction(fileRecord.id, 'hide')}>Hide</button>
        {:else if fileRecord.isHidden}
          <button on:click={() => handleFileAction(fileRecord.id, 'unhide')}>Unhide</button>
        {/if}
        {#if !fileRecord.isFavorite}
          <button on:click={() => handleFileAction(fileRecord.id, 'favorite')}>fav</button>
        {:else if fileRecord.isFavorite}
          <button on:click={() => handleFileAction(fileRecord.id, 'unfavorite')}>unfav</button>
        {/if}
        <button on:click={() => handleFileAction(fileRecord.id, 'delete')}>Delete</button>
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
    transition: all 1s cubic-bezier(0.19, 1, 0.22, 1);
    opacity: 0;
  }

  .video {
    flex-direction: column;
  }
  .video a {
    margin-top: 1rem;
    text-decoration: underline;
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
    opacity: 0.1;
  }
  .fadeIn {
    animation: fadeIn 0.2s ease-out;
    animation-fill-mode: both;
  }
</style>
