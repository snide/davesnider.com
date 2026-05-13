<script lang="ts">
  type Props = {
    src: string;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    controls?: boolean;
    poster?: string;
    caption?: string;
  };

  let { src, autoplay = false, loop = false, muted = false, controls = true, poster, caption }: Props = $props();
</script>

<div class="videoPlayer">
  <video
    {controls}
    {loop}
    muted={muted || autoplay}
    {autoplay}
    playsinline
    preload={autoplay ? 'metadata' : 'none'}
    {poster}
  >
    <source {src} type="video/mp4" />
  </video>
  {#if caption}
    <p class="videoPlayer__caption">{caption}</p>
  {/if}
</div>

<style>
  .videoPlayer {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
  }

  .videoPlayer video {
    width: 100%;
    display: block;
    object-fit: contain;
  }

  .videoPlayer__caption {
    font-size: 0.875rem;
    font-family: var(--codeFont);
    text-align: center;
    color: var(--subtle);
    margin-top: 0.5rem;
  }
</style>
