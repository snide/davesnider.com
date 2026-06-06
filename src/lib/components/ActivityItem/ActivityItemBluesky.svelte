<script lang="ts">
  import type { BlueskyThreadPost, SelectBlueskyAuthor } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';
  import BlueskyThread from '$lib/components/BlueskyThread/BlueskyThread.svelte';

  interface Props {
    externalId: string;
    thread: BlueskyThreadPost[];
    authors: Map<string, SelectBlueskyAuthor>;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { externalId, thread, authors, timestamp, isPrivate, isAdmin, onHide }: Props = $props();
</script>

<ActivityItem type="bluesky" {timestamp} {isPrivate} {isAdmin} {onHide}>
  <BlueskyThread {thread} {authors} currentUri={externalId} />
</ActivityItem>
