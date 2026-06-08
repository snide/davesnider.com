<script lang="ts">
  import PlexAddForm from '$lib/components/PlexAddForm/PlexAddForm.svelte';
  import Button from '$lib/components/Button/Button.svelte';
</script>

<svelte:head>
  <title>Add Activity - Dave Snider</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="addActivity">
  <div class="addActivity__header">
    <h1>Add Activity</h1>
    <Button href="/activity">Back to Activity</Button>
  </div>

  <section class="addActivity__section">
    <h2>Add Movie or TV Episode</h2>
    <p class="addActivity__description">
      Enter an IMDB ID to add a movie or TV episode. Episodes from the same show watched on the same day will be merged
      automatically.
    </p>
    <PlexAddForm />
  </section>
</div>

<style>
  .addActivity {
    max-width: 40rem;
    margin: 0 auto;
  }

  .addActivity__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 2rem;
    gap: 1rem;
  }

  .addActivity__header h1 {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
  }

  .addActivity__section {
    margin-bottom: 3rem;
  }

  .addActivity__section h2 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
  }

  .addActivity__description {
    color: var(--subtle);
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  @media (max-width: 768px) {
    .addActivity__header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
