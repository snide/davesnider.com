<script lang="ts">
  type Props = {
    src: string;
    caption?: string;
  };

  let { src, caption }: Props = $props();
</script>

<div class="postImage">
  <img {src} alt={caption || ''} loading="lazy" />
  {#if caption}
    <p class="postImage__caption">{caption}</p>
  {/if}
</div>

<style>
  .postImage {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
  }

  .postImage img {
    width: 100%;
    height: auto;
    margin-bottom: 0.5rem;
  }

  .postImage__caption {
    font-size: 0.875rem;
    font-family: var(--codeFont);
    text-align: center;
    color: var(--subtle);
  }
</style>
