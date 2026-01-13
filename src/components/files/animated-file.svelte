<script lang="ts">
  export let src: string;
  export let alt: string = '';
  export let width: number | string = 'auto';
  export let height: number | string = 'auto';
  export let type: 'image' | 'video' = 'image';
  export let className: string = '';

  let mediaLoaded = false;
  let videoRetryCount = 0;
  let videoKey = 0;

  function handleLoaded() {
    mediaLoaded = true;
  }

  function handleVideoError() {
    if (videoRetryCount < 2) {
      videoRetryCount++;
      videoKey++;
    }
  }
</script>

{#if type === 'image'}
  <img {src} {alt} {width} {height} class={`${className} ${mediaLoaded ? 'slideup' : ''}`} on:load={handleLoaded} />
{:else if type === 'video'}
  {#key `${src}-${videoKey}`}
    <video class="{className} {mediaLoaded ? 'slideup' : ''}" on:loadeddata={handleLoaded} on:error={handleVideoError} controls preload="metadata">
      <source {src} type="video/mp4" />
    </video>
  {/key}
{/if}

<style>
  img,
  video {
    justify-self: center;
    width: auto;
    height: auto;
  }
  .slideup {
    animation: slideup 0.2s ease-in-out;
    animation-fill-mode: both;
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
</style>
