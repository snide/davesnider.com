<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';

  let { data }: { data: PageData } = $props();
  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';

    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (response.ok) {
      goto('/museum');
    } else {
      error = 'Invalid credentials';
    }
    loading = false;
  }

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    goto('/');
  }
</script>

<svelte:head>
  <title>Login - Dave Snider</title>
</svelte:head>

<div class="authPage">
  <a href="/" class="authPage__logo"><h1>S</h1></a>

  {#if data.isLoggedIn}
    <button class="btn authPage__logout" onclick={handleLogout}>Logout</button>
  {:else}
    <form onsubmit={handleLogin} class="authPage__form">
      <input type="text" placeholder="Username" bind:value={username} required />
      <input type="password" placeholder="Password" bind:value={password} required />
      {#if error}
        <p class="authPage__error">{error}</p>
      {/if}
      <button type="submit" class="btn" disabled={loading}>
        {loading ? 'Loading...' : 'Login'}
      </button>
    </form>
  {/if}
</div>

<style>
  .authPage {
    display: flex;
    flex-direction: column;
    max-width: 20rem;
    margin: 0 auto;
    width: 100%;
  }

  .authPage__logo {
    display: inline-block;
    margin: 0 auto 2rem auto;
    color: var(--inputBg);
    aspect-ratio: 1/1;
  }

  .authPage__logo:focus-visible {
    outline: none;
  }

  .authPage__logo:focus-visible h1 {
    color: var(--fg);
    text-decoration: underline;
  }

  .authPage__logo:hover {
    background: var(--fg);
  }

  .authPage__logo h1 {
    font-size: 8rem;
    text-align: center;
    font-family: var(--displayFont);
    line-height: 1;
  }

  .authPage__form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .authPage__error {
    color: red;
    font-size: 0.875rem;
  }

  .authPage__logout {
    width: 100%;
  }
</style>
