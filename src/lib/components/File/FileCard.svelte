<script lang="ts">
  import { StlViewer } from '$lib/components/StlViewer';

  type FileWithThumb = {
    fileId: string;
    url: string;
    fileTypeCategory: string;
    thumb: {
      url: string;
      resizedUrl: string;
      width?: number;
      height?: number;
    };
  };

  type Props = {
    file: FileWithThumb;
  };

  let { file }: Props = $props();
  let mediaLoaded = $state(false);

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

<figure class="fileCard">
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
