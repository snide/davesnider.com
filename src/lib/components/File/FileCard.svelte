<script lang="ts">
  import { StlViewer } from '$lib/components/StlViewer';

  type FileWithThumb = {
    fileId: string;
    url: string;
    fileTypeCategory: string;
    isHidden: boolean;
    isFavorite: boolean;
    thumb: {
      url: string;
      resizedUrl: string;
      width?: number;
      height?: number;
    };
  };

  type Props = {
    file: FileWithThumb;
    isLoggedIn?: boolean;
    onAction?: (fileId: string, action: string, updatedFile: FileWithThumb) => void;
  };

  let { file, isLoggedIn = false, onAction }: Props = $props();
  let mediaLoaded = $state(false);
  let isActioning = $state(false);

  async function handleAction(action: 'hide' | 'unhide' | 'favorite' | 'unfavorite' | 'delete') {
    if (isActioning) return;
    isActioning = true;

    try {
      const response = await fetch(`/api/file/${action}/${file.fileId}`, {
        method: 'POST'
      });

      if (response.ok) {
        const updatedFile = await response.json();
        onAction?.(file.fileId, action, updatedFile);
      }
    } catch (error) {
      console.error('Error performing action:', error);
    } finally {
      isActioning = false;
    }
  }

  // Track click vs drag for STL viewer (so dragging to rotate doesn't navigate)
  let mouseDownPos = { x: 0, y: 0 };
  const DRAG_THRESHOLD = 5;

  function handleStlMouseDown(e: MouseEvent) {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  }

  function handleStlMouseUp(e: MouseEvent) {
    const dx = Math.abs(e.clientX - mouseDownPos.x);
    const dy = Math.abs(e.clientY - mouseDownPos.y);
    if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
      // It was a click, not a drag - navigate to detail page
      window.location.href = `/file/${file.fileId}`;
    }
  }

  function handleLoaded() {
    mediaLoaded = true;
  }
</script>

<figure class="fileCard" class:fileCard--hidden={file.isHidden}>
  {#if file.fileTypeCategory === 'video'}
    <div class="fileCard__video">
      <video controls preload="metadata">
        <source src={`https://files.davesnider.com/${file.url}`} type="video/mp4" />
      </video>
      <a href={`/file/${file.fileId}`}>Video link</a>
    </div>
  {:else if file.fileTypeCategory === 'model'}
    <div
      class="fileCard__stl"
      role="button"
      tabindex="0"
      onmousedown={handleStlMouseDown}
      onmouseup={handleStlMouseUp}
      onkeydown={(e) => e.key === 'Enter' && (window.location.href = `/file/${file.fileId}`)}
    >
      <StlViewer src={`https://files.davesnider.com/${file.url}`} height="100%" />
    </div>
  {:else if file.fileTypeCategory === 'image'}
    <a href={`/file/${file.fileId}`}>
      <img
        src={file.thumb?.resizedUrl || file.thumb?.url}
        height={file.thumb?.height || 'auto'}
        width={file.thumb?.width || 'auto'}
        loading="lazy"
        alt={file.fileId}
        class:fileCard__fadeIn={mediaLoaded}
        onload={handleLoaded}
      />
    </a>
  {:else}
    <a href={`/file/${file.fileId}`}>
      <img
        src={file.thumb?.url}
        loading="lazy"
        alt={file.fileId}
        class:fileCard__fadeIn={mediaLoaded}
        onload={handleLoaded}
      />
    </a>
  {/if}

  {#if isLoggedIn}
    <div class="actions">
      {#if !file.isHidden}
        <button onclick={() => handleAction('hide')} disabled={isActioning}>Hide</button>
      {:else}
        <button onclick={() => handleAction('unhide')} disabled={isActioning}>Unhide</button>
      {/if}
      {#if !file.isFavorite}
        <button onclick={() => handleAction('favorite')} disabled={isActioning}>fav</button>
      {:else}
        <button onclick={() => handleAction('unfavorite')} disabled={isActioning}>unfav</button>
      {/if}
      <button onclick={() => handleAction('delete')} disabled={isActioning}>Delete</button>
    </div>
  {/if}
</figure>

<style>
  .fileCard {
    list-style: none;
    background-color: var(--fileBg);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }

  .fileCard::before {
    content: '';
    display: block;
    padding-top: 100%;
  }

  .fileCard img,
  .fileCard__video {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fileCard img {
    transition: all 1s cubic-bezier(0.19, 1, 0.22, 1);
    opacity: 0;
    object-fit: contain;
    max-width: 100%;
    max-height: 100%;
  }

  .fileCard__fadeIn {
    animation: fadeIn 0.2s ease-out;
    animation-fill-mode: both;
  }

  .fileCard__video {
    flex-direction: column;
  }

  .fileCard__video video {
    width: 100%;
    object-fit: contain;
    max-width: 100%;
    max-height: 100%;
  }

  .fileCard__video a {
    display: inline-block;
    text-decoration: underline;
    font-family: var(--codeFont);
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }

  .fileCard__stl {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

  .fileCard:hover {
    background-color: var(--fileHoverBg);
    z-index: 1;
  }

  .fileCard:hover .actions {
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

  .actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .fileCard--hidden img,
  .fileCard--hidden video {
    opacity: 0.1 !important;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
