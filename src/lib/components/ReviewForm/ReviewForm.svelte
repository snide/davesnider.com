<script lang="ts">
  import Button from '#lib/components/Button/Button.svelte';
  import StarRating from '#lib/components/StarRating/StarRating.svelte';

  type Props = {
    endpoint: string; // PATCH URL, e.g. `/api/activity/plex/${id}`
    currentRating: number | null;
    currentReview: string | null;
    onEditingChange?: (editing: boolean) => void;
    onSave?: (rating: number | null, review: string | null) => void;
  };

  let { endpoint, currentRating, currentReview, onEditingChange, onSave }: Props = $props();

  let isEditing = $state(false);
  let rating = $state(currentRating ?? 0);
  let review = $state(currentReview ?? '');
  let saving = $state(false);

  function setEditing(value: boolean) {
    isEditing = value;
    onEditingChange?.(value);
  }

  async function save() {
    saving = true;
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: rating || null, review: review || null })
      });
      if (res.ok) {
        setEditing(false);
        onSave?.(rating || null, review || null);
      }
    } finally {
      saving = false;
    }
  }

  function cancel() {
    setEditing(false);
    rating = currentRating ?? 0;
    review = currentReview ?? '';
  }

  function autosize(node: HTMLTextAreaElement) {
    const resize = () => {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + 'px';
    };
    resize();
    return { destroy() {} };
  }
</script>

{#if isEditing}
  <div class="reviewForm">
    <StarRating {rating} isEditing={true} onRate={(value) => (rating = value)} />
    <textarea
      class="reviewForm__textarea"
      bind:value={review}
      placeholder="Write a review..."
      oninput={(e) => {
        const target = e.target as HTMLTextAreaElement;
        target.style.height = 'auto';
        target.style.height = target.scrollHeight + 'px';
      }}
      use:autosize></textarea>
    <div class="reviewForm__actions">
      <Button size="sm" onclick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </Button>
      <Button size="sm" variant="ghost" onclick={cancel} disabled={saving}>Cancel</Button>
    </div>
  </div>
{:else}
  <Button size="sm" onclick={() => setEditing(true)}>
    {currentReview ? 'Edit review' : 'Add review'}
  </Button>
{/if}

<style>
  .reviewForm {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .reviewForm__textarea {
    background: var(--bg);
    border: 1px solid var(--subtle);
    color: var(--fg);
    font-family: inherit;
    font-size: 0.9375rem;
    padding: 0.5rem;
    resize: none;
    width: 100%;
    min-height: 4rem;
    overflow: hidden;
  }

  .reviewForm__textarea:focus {
    outline: none;
    border-color: var(--fg);
  }

  .reviewForm__actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
