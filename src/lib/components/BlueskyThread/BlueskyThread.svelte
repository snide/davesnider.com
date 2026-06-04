<script lang="ts">
  import Video from '$lib/components/Video/Video.svelte';
  import OgPreview from '$lib/components/OgPreview/OgPreview.svelte';

  type Props = {
    postUri: string;
    currentUri?: string;
  };

  let { postUri, currentUri }: Props = $props();

  interface ThreadPost {
    uri: string;
    url: string;
    author: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
    text: string;
    facets?: Array<{
      index: { byteStart: number; byteEnd: number };
      features: Array<{
        $type: string;
        did?: string;
        uri?: string;
        tag?: string;
      }>;
    }>;
    createdAt: string;
    images?: string[];
  }

  let thread = $state<ThreadPost[]>([]);
  let loading = $state(true);
  let error = $state(false);

  $effect(() => {
    loading = true;
    error = false;

    fetch(`/api/bluesky/post?uri=${encodeURIComponent(postUri)}&mode=thread`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        thread = data.thread || [];
        loading = false;
      })
      .catch(() => {
        error = true;
        loading = false;
      });
  });

  function formatTime(createdAt: string): string {
    const date = new Date(createdAt);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderText(text: string, facets?: ThreadPost['facets']): string {
    if (!facets || facets.length === 0) {
      return escapeHtml(text);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const bytes = encoder.encode(text);

    const sortedFacets = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

    let result = '';
    let lastEnd = 0;

    for (const facet of sortedFacets) {
      const { byteStart, byteEnd } = facet.index;

      if (byteStart > lastEnd) {
        result += escapeHtml(decoder.decode(bytes.slice(lastEnd, byteStart)));
      }

      const segment = decoder.decode(bytes.slice(byteStart, byteEnd));

      let formatted = escapeHtml(segment);
      for (const feature of facet.features) {
        if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
          formatted = `<a href="${escapeHtml(feature.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment)}</a>`;
        } else if (feature.$type === 'app.bsky.richtext.facet#mention' && feature.did) {
          formatted = `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment)}</a>`;
        } else if (feature.$type === 'app.bsky.richtext.facet#tag' && feature.tag) {
          formatted = `<a href="https://bsky.app/hashtag/${escapeHtml(feature.tag)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment)}</a>`;
        }
      }

      result += formatted;
      lastEnd = byteEnd;
    }

    if (lastEnd < bytes.length) {
      result += escapeHtml(decoder.decode(bytes.slice(lastEnd)));
    }

    return result;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractYouTubeIds(facets?: ThreadPost['facets']): string[] {
    if (!facets) return [];

    const ids: string[] = [];
    const youtubeRegex =
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;

    for (const facet of facets) {
      for (const feature of facet.features) {
        if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
          const match = feature.uri.match(youtubeRegex);
          if (match) {
            ids.push(match[1]);
          }
        }
      }
    }

    return ids;
  }

  function extractOtherLinks(facets?: ThreadPost['facets']): string[] {
    if (!facets) return [];

    const links: string[] = [];
    const videoRegex = /(?:youtube\.com|youtu\.be|vimeo\.com)/;

    for (const facet of facets) {
      for (const feature of facet.features) {
        if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
          if (!videoRegex.test(feature.uri)) {
            links.push(feature.uri);
          }
        }
      }
    }

    return links;
  }
</script>

{#if loading}
  <div class="thread thread--loading">
    <span>Loading thread...</span>
  </div>
{:else if error || thread.length === 0}
  <div class="thread thread--error">
    <span>Could not load thread</span>
  </div>
{:else}
  <div class="thread">
    {#each thread as post, i}
      {const isCurrent = post.uri === currentUri}
      {const youtubeIds = extractYouTubeIds(post.facets)}
      {const otherLinks = extractOtherLinks(post.facets)}
      <div class="threadPost" class:threadPost--current={isCurrent}>
        {#if i > 0}
          <div class="threadPost__connector"></div>
        {/if}
        <div class="threadPost__header">
          {#if post.author.avatar}
            <img src={post.author.avatar} alt="" class="threadPost__avatar" />
          {/if}
          <div class="threadPost__authorInfo">
            <span class="threadPost__author">
              {post.author.displayName || `@${post.author.handle}`}
            </span>
            <span class="threadPost__handle">@{post.author.handle}</span>
          </div>
          <a href={post.url} target="_blank" rel="noopener noreferrer" class="threadPost__time">
            {formatTime(post.createdAt)}
          </a>
        </div>
        <div class="threadPost__content">
          <p class="threadPost__text">{@html renderText(post.text, post.facets)}</p>
          {#if post.images && post.images.length > 0}
            <div class="threadPost__images">
              {#each post.images as image}
                <img src={image} alt="" class="threadPost__image" />
              {/each}
            </div>
          {/if}
          {#if youtubeIds.length > 0}
            <div class="threadPost__embeds">
              {#each youtubeIds as id}
                <Video source="youtube" {id} />
              {/each}
            </div>
          {/if}
          {#if otherLinks.length > 0}
            <div class="threadPost__linkPreviews">
              {#each otherLinks as link}
                <OgPreview url={link} />
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .thread {
    display: flex;
    flex-direction: column;
  }

  .thread--loading,
  .thread--error {
    color: var(--subtle);
    font-style: italic;
    padding: 1rem 0;
  }

  .threadPost {
    position: relative;
    padding: 1rem;
    padding-left: 3.5rem;
  }

  .threadPost--current {
    background: color-mix(in srgb, var(--fg) 5%, transparent);
    border-radius: 0.5rem;
  }

  .threadPost__connector {
    position: absolute;
    left: 1.75rem;
    top: -0.5rem;
    width: 2px;
    height: 1.5rem;
    background: var(--subtle);
  }

  .threadPost__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .threadPost__avatar {
    position: absolute;
    left: 0.75rem;
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }

  .threadPost__authorInfo {
    display: flex;
    flex-direction: column;
  }

  .threadPost__author {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .threadPost__handle {
    color: var(--subtle);
    font-size: 0.8rem;
  }

  .threadPost__time {
    margin-left: auto;
    color: var(--subtle);
    font-size: 0.8rem;
    text-decoration: none;
  }

  .threadPost__time:hover {
    text-decoration: underline;
  }

  .threadPost__content {
    margin-left: 0;
  }

  .threadPost__text {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .threadPost__text :global(a) {
    color: var(--fg);
    text-decoration: underline;
  }

  .threadPost__images {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .threadPost__image {
    max-width: 200px;
    max-height: 200px;
    border-radius: 0.5rem;
    object-fit: cover;
  }

  .threadPost__embeds {
    margin-top: 0.75rem;
  }

  .threadPost__linkPreviews {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
</style>
