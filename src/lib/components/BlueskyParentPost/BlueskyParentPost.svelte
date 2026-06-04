<script lang="ts">
  type Props = {
    replyToUri: string;
  };

  let { replyToUri }: Props = $props();

  let parentPost = $state<{
    url: string;
    author: {
      handle: string;
      displayName?: string;
      avatar?: string;
    };
    text: string;
    images?: string[];
  } | null>(null);
  let loading = $state(true);
  let error = $state(false);

  $effect(() => {
    loading = true;
    error = false;

    fetch(`/api/bluesky/post?uri=${encodeURIComponent(replyToUri)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        parentPost = data;
        loading = false;
      })
      .catch(() => {
        error = true;
        loading = false;
      });
  });

  function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
</script>

{#if loading}
  <div class="parentPost parentPost--loading">
    <span>Loading parent post...</span>
  </div>
{:else if error || !parentPost}
  <div class="parentPost parentPost--error">
    <span>Could not load parent post</span>
  </div>
{:else}
  <a href={parentPost.url} target="_blank" rel="noopener noreferrer" class="parentPost">
    <div class="parentPost__header">
      {#if parentPost.author.avatar}
        <img src={parentPost.author.avatar} alt="" class="parentPost__avatar" />
      {/if}
      <span class="parentPost__author">
        {parentPost.author.displayName || `@${parentPost.author.handle}`}
      </span>
      <span class="parentPost__handle">@{parentPost.author.handle}</span>
    </div>
    <p class="parentPost__text">{truncateText(parentPost.text, 280)}</p>
    {#if parentPost.images && parentPost.images.length > 0}
      <div class="parentPost__images">
        {#each parentPost.images.slice(0, 2) as image}
          <img src={image} alt="" class="parentPost__image" />
        {/each}
      </div>
    {/if}
  </a>
{/if}

<style>
  .parentPost {
    display: block;
    padding: 0.75rem;
    border: 1px solid var(--subtle);
    border-left: 3px solid var(--subtle);
    border-radius: 0.5rem;
    text-decoration: none;
    color: inherit;
    margin-bottom: 1rem;
    background: color-mix(in srgb, var(--subtle) 10%, transparent);
  }

  .parentPost:hover {
    border-color: var(--fg);
  }

  .parentPost--loading,
  .parentPost--error {
    color: var(--subtle);
    font-size: 0.875rem;
    font-style: italic;
  }

  .parentPost__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .parentPost__avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }

  .parentPost__author {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .parentPost__handle {
    color: var(--subtle);
    font-size: 0.875rem;
  }

  .parentPost__text {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .parentPost__images {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .parentPost__image {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 0.25rem;
  }
</style>
