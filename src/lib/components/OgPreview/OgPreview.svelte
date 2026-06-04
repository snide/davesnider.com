<script lang="ts">
  type Props = {
    url: string;
  };

  let { url }: Props = $props();

  let ogData = $state<{
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
  } | null>(null);
  let loading = $state(true);
  let error = $state(false);

  $effect(() => {
    loading = true;
    error = false;

    fetch(`/api/og?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((data) => {
        ogData = data;
        loading = false;
      })
      .catch(() => {
        error = true;
        loading = false;
      });
  });

  // Extract domain from URL
  function getDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }
</script>

{#if loading}
  <div class="ogPreview ogPreview--loading">
    <span>Loading preview...</span>
  </div>
{:else if error || !ogData?.title}
  <!-- Don't show anything if no OG data -->
{:else}
  <a href={url} target="_blank" rel="noopener noreferrer" class="ogPreview">
    {#if ogData.image}
      <img src={ogData.image} alt="" class="ogPreview__image" />
    {/if}
    <div class="ogPreview__content">
      <span class="ogPreview__site">{ogData.siteName || getDomain(url)}</span>
      <span class="ogPreview__title">{ogData.title}</span>
      {#if ogData.description}
        <span class="ogPreview__description">{ogData.description}</span>
      {/if}
    </div>
  </a>
{/if}

<style>
  .ogPreview {
    display: flex;
    gap: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--subtle);
    border-radius: 0.5rem;
    text-decoration: none;
    color: inherit;
    margin: 0.5rem 0;
    transition: border-color 0.2s;
  }

  .ogPreview:hover {
    border-color: var(--fg);
  }

  .ogPreview--loading {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .ogPreview__image {
    width: 120px;
    height: 80px;
    object-fit: cover;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .ogPreview__content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .ogPreview__site {
    font-size: 0.75rem;
    color: var(--subtle);
    text-transform: uppercase;
  }

  .ogPreview__title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .ogPreview__description {
    font-size: 0.875rem;
    color: var(--subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
</style>
