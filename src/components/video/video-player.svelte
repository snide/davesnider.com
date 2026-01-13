<script lang="ts">
  export let src: string;
  export let autoplay: boolean = false;
  export let loop: boolean = false;
  export let muted: boolean = false;
  export let controls: boolean = true;
  export let poster: string = '';

  let retryCount = 0;
  let videoKey = 0;

  function handleError() {
    if (retryCount < 3) {
      retryCount++;
      videoKey++;
    }
  }
</script>

<div class="videoPlayer">
  {#key videoKey}
    <video
      {controls}
      {loop}
      muted={muted || autoplay}
      autoplay={autoplay}
      playsinline
      preload={autoplay ? 'metadata' : 'none'}
      poster={poster || undefined}
      on:error={handleError}
    >
      <source {src} type="video/mp4" />
    </video>
  {/key}
</div>

<style>
  .videoPlayer {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto;
  }

  .videoPlayer :global(video) {
    width: 100%;
    display: block;
    object-fit: contain;
  }
</style>
