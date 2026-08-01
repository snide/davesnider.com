<script lang="ts">
  import type { SelectActivityLink } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';
  import OgPreview from '$lib/components/OgPreview/OgPreview.svelte';

  interface Props {
    details: SelectActivityLink;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide }: Props = $props();
</script>

<ActivityItem type="link" {timestamp} {isPrivate} {isAdmin} {onHide}>
  {#if details.comment}
    <p class="activityItemLink__comment">{details.comment}</p>
  {/if}
  <OgPreview url={details.url} />
</ActivityItem>

<style>
  .activityItemLink__comment {
    line-height: 1.6;
    color: var(--fg);
    font-size: 0.9375rem;
    margin-bottom: 0.5rem;
    /* Comments are plain text from the bookmarks TUI — keep their line breaks. */
    white-space: pre-line;
  }
</style>
