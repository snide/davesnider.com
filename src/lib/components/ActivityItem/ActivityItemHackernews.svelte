<script lang="ts">
  import type { SelectActivityHackernews } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';
  import DOMPurify from 'isomorphic-dompurify';

  interface Props {
    details: SelectActivityHackernews;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide }: Props = $props();

  const hnTypeMap: Record<string, string> = {
    story: 'Post',
    comment: 'Comment',
    ask: 'Ask HN',
    show: 'Show HN'
  };

  let hnType = $derived(details.itemType ? hnTypeMap[details.itemType] || 'Post' : 'Post');
  let hnTitle = $derived((details.title || '').replace(/^Comment on:\s*/i, ''));
  let isComment = $derived(details.itemType === 'comment');
</script>

<ActivityItem type="hackernews" {timestamp} {isPrivate} {isAdmin} {onHide}>
  <div class="hnBody__row">
    {#if details.hnScore}
      <span class="hnBody__score">&blacktriangle;{details.hnScore}</span>
    {/if}
    <div class="hnBody__content">
      <a href={details.url} class="hnBody__title" target="_blank" rel="noopener noreferrer">
        {hnType} - {hnTitle}
      </a>
      {#if details.commentCount}
        <div class="hnBody__comments">{details.commentCount} comments</div>
      {/if}
    </div>
  </div>
  {#if details.body}
    <div class="hnBody__reply" class:hnBody__reply--visible={isComment}>
      <span class="hnBody__replyArrow">⤷</span>
      <div class="hnBody__text">{@html DOMPurify.sanitize(details.body)}</div>
    </div>
  {/if}
</ActivityItem>

<style>
  .hnBody__row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .hnBody__content {
    flex: 1;
    min-width: 0;
  }

  .hnBody__title {
    font-weight: 600;
    line-height: 1.4;
    color: var(--subtle);
    text-decoration: none;
  }

  .hnBody__title:hover {
    text-decoration: underline;
  }

  .hnBody__score {
    background: var(--fg);
    color: var(--bg);
    padding: 0 0.3rem;
    font-size: 0.85em;
    flex-shrink: 0;
    text-decoration: none;
    display: inline-block;
  }

  .hnBody__comments {
    color: var(--subtle);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .hnBody__reply {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .hnBody__replyArrow {
    display: none;
    color: var(--subtle);
    font-size: 1rem;
    line-height: 1.6;
    flex-shrink: 0;
  }

  .hnBody__reply--visible .hnBody__replyArrow {
    display: block;
  }

  .hnBody__reply--visible .hnBody__text {
    flex: 1;
    min-width: 0;
  }

  .hnBody__text {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
  }

  .hnBody__text :global(p) {
    margin: 0.5rem 0;
  }

  .hnBody__text :global(p:first-child) {
    margin-top: 0;
  }

  .hnBody__text :global(p:last-child) {
    margin-bottom: 0;
  }

  .hnBody__text :global(a) {
    color: var(--fg);
    text-decoration: underline;
  }

  .hnBody__text :global(i) {
    font-style: italic;
  }

  .hnBody__text :global(code) {
    font-family: 'BerkeleyMono', monospace;
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-size: 0.9em;
  }

  .hnBody__text :global(pre) {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .hnBody__text :global(pre code) {
    background: none;
    padding: 0;
  }
</style>
