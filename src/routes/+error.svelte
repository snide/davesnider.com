<script lang="ts">
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>Page not found - Dave Snider</title>
</svelte:head>

<div class="errorPage">
  <h1 class="errorPage__code">{$page.status}</h1>
  <p class="errorPage__message">{$page.error?.message || 'Page not found'}</p>
</div>

<style>
  .errorPage__code {
    font-size: 10rem;
    font-family: var(--codeFont);
    color: var(--inputBg);
  }

  .errorPage__message {
    font-size: 1.5rem;
  }

  .errorPage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: start;
    height: 100%;
  }
</style>
