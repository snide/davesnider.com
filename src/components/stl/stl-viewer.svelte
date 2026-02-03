<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from './scene.svelte';
  import Loader from '@components/loader.svelte';

  interface Props {
    url: string;
    height?: string;
    autoRotate?: boolean;
    wireframe?: boolean;
  }

  let { url, height = '400px', autoRotate = false, wireframe = false }: Props = $props();

  let isLoading = $state(true);
  let hasError = $state(false);
  let errorMessage = $state('');

  function handleLoad() {
    isLoading = false;
  }

  function handleError(message: string) {
    isLoading = false;
    hasError = true;
    errorMessage = message;
  }
</script>

<div class="stl-container" style:height>
  {#if isLoading}
    <div class="loader-wrap">
      <Loader />
    </div>
  {/if}

  {#if hasError}
    <div class="error">
      <p>Failed to load model</p>
      <code>{errorMessage}</code>
    </div>
  {:else}
    <Canvas>
      <Scene {url} {autoRotate} {wireframe} onLoad={handleLoad} onError={handleError} />
    </Canvas>
  {/if}
</div>

<style>
  .stl-container {
    position: relative;
    width: 100%;
    background-color: var(--bg);
    border-radius: 4px;
    overflow: hidden;
  }

  .loader-wrap {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
  }

  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--subtle);
    font-family: var(--codeFont);
    gap: 0.5rem;
  }

  .error code {
    font-size: 0.75rem;
    color: var(--subtle);
  }
</style>
