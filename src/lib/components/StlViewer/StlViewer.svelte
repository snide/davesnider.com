<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from './Scene.svelte';
  import Loader from './Loader.svelte';

  type Props = {
    src: string;
    caption?: string;
    height?: string;
    autoRotate?: boolean;
    wireframe?: boolean;
  };

  let { src, caption, height = '500px', autoRotate = false, wireframe = false }: Props = $props();

  let isLoading = $state(true);
  let hasError = $state(false);
  let errorMessage = $state('');

  // Build full URL from path fragment, using proxy to avoid CORS
  const baseUrl = 'https://files.davesnider.com';
  const directUrl = $derived(src.startsWith('http') ? src : `${baseUrl}/${src}`);
  // Use proxy for files.davesnider.com to avoid CORS issues
  const url = $derived(
    directUrl.startsWith('https://files.davesnider.com/')
      ? `/api/proxy/stl?url=${encodeURIComponent(directUrl)}`
      : directUrl
  );

  function handleLoad() {
    isLoading = false;
  }

  function handleError(message: string) {
    isLoading = false;
    hasError = true;
    errorMessage = message;
  }
</script>

<div class="stlViewer">
  <div class="stlViewer__container" style:height>
    {#if isLoading}
      <div class="stlViewer__loader">
        <Loader />
      </div>
    {/if}

    {#if hasError}
      <div class="stlViewer__error">
        <p>Failed to load model</p>
        <code>{errorMessage}</code>
      </div>
    {:else}
      <Canvas>
        <Scene {url} {autoRotate} {wireframe} onLoad={handleLoad} onError={handleError} />
      </Canvas>
    {/if}
  </div>
  {#if caption}
    <p class="stlViewer__caption">
      <a href={directUrl}>{caption}</a>
    </p>
  {/if}
</div>

<style>
  .stlViewer {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
  }

  .stlViewer__container {
    position: relative;
    width: 100%;
    background-color: var(--bg);
    border-radius: 4px;
    overflow: hidden;
  }

  .stlViewer__loader {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
  }

  .stlViewer__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--subtle);
    font-family: var(--codeFont);
    gap: 0.5rem;
  }

  .stlViewer__error code {
    font-size: 0.75rem;
    color: var(--subtle);
  }

  .stlViewer__caption {
    font-size: 0.875rem;
    font-family: var(--codeFont);
    text-align: center;
    margin-top: 0.5rem;
  }
</style>
