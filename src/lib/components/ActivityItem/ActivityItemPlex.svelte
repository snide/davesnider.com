<script lang="ts">
  import type { SelectActivityPlex } from '$db/schema';
  import ActivityItemPlexMovie from './ActivityItemPlexMovie.svelte';
  import ActivityItemPlexTV from './ActivityItemPlexTV.svelte';

  interface Props {
    activityId: number;
    details: SelectActivityPlex;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
    onUpdate: (rating: number | null, review: string | null) => void;
  }

  let { activityId, details, timestamp, isPrivate, isAdmin, onHide, onUpdate }: Props = $props();
</script>

{#if details.mediaType === 'show'}
  <ActivityItemPlexTV {activityId} {details} {timestamp} {isPrivate} {isAdmin} {onHide} />
{:else}
  <ActivityItemPlexMovie {activityId} {details} {timestamp} {isPrivate} {isAdmin} {onHide} {onUpdate} />
{/if}
