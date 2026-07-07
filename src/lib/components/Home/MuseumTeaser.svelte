<script lang="ts">
  interface Props {
    item: { fileId: string; thumbUrl: string };
  }

  let { item }: Props = $props();
</script>

<a href={`/file/${item.fileId}`} class="museumTeaser">
  <img src={item.thumbUrl} alt="" class="museumTeaser__thumb" loading="lazy" />
</a>

<style>
  .museumTeaser {
    display: block;
  }

  .museumTeaser__thumb {
    width: 100%;
    height: auto;
    filter: grayscale(100%);
    transition: filter 0.2s ease-in-out;
  }

  .museumTeaser:hover .museumTeaser__thumb,
  .museumTeaser:focus .museumTeaser__thumb {
    filter: none;
  }
</style>
