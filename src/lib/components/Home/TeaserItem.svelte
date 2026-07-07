<script lang="ts">
  interface Props {
    href: string;
    title: string;
    meta?: string;
    thumbnailUrl?: string | null;
    external?: boolean;
  }

  let { href, title, meta, thumbnailUrl, external = false }: Props = $props();
</script>

<a
  {href}
  class={['teaserItem', !thumbnailUrl && 'teaserItem--noThumb']}
  target={external ? '_blank' : undefined}
  rel={external ? 'noopener noreferrer' : undefined}
>
  {#if thumbnailUrl}
    <img src={thumbnailUrl} alt="" class="teaserItem__thumb" loading="lazy" />
  {/if}
  <span class="teaserItem__text">
    <span class="teaserItem__title">{title}</span>
    {#if meta}
      <span class="teaserItem__meta">{meta}</span>
    {/if}
  </span>
</a>

<style>
  .teaserItem {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 0;
  }

  .teaserItem__thumb {
    width: 2.5rem;
    height: 2.5rem;
    object-fit: cover;
    flex-shrink: 0;
    filter: grayscale(100%);
    transition: filter 0.2s ease-in-out;
  }

  .teaserItem:hover .teaserItem__thumb,
  .teaserItem:focus .teaserItem__thumb {
    filter: none;
  }

  .teaserItem__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .teaserItem__title {
    font-size: 0.875rem;
    line-height: 1.3;
  }

  .teaserItem:hover .teaserItem__title,
  .teaserItem:focus .teaserItem__title {
    background-color: var(--fg);
    color: var(--bg);
  }

  .teaserItem__meta {
    color: var(--subtle);
    font-size: 0.75rem;
    margin-top: 0.125rem;
  }
</style>
