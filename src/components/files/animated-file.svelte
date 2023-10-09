<script lang="ts">
  export let src: string;
  export let alt: string = '';
  export let width: number;
  export let height: number;
  export let type: 'image' | 'video' = 'image';
  export let className: string = '';

  let mediaLoaded = false;

  function handleLoaded() {
    mediaLoaded = true;
  }
</script>

{#if type === 'image'}
  <img {src} {alt} {width} {height} class="{className} {mediaLoaded ? 'slideup' : ''}" on:load={handleLoaded} />
{:else if type === 'video'}
  <video {src} class="{className} {mediaLoaded ? 'slideup' : ''}" on:loadeddata={handleLoaded} controls> </video>
{/if}

<style>
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
