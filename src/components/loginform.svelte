<script lang="ts">
  let responseMessage: string;

  async function submit(e: Event) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const response = await fetch('/api/auth', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    responseMessage = data.message;

    if (response.status === 200) {
      window.location.href = '/auth';
    }
  }
</script>

<form on:submit={submit}>
  <label for="username">
    Username
    <input type="text" id="username" name="username" required />
  </label>
  <label>
    Password
    <input type="password" id="password" name="password" required />
  </label>
  <div>
    <button class="btn" type="submit">Login</button>
  </div>
  {#if responseMessage}
    <p>{responseMessage}</p>
  {/if}
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--subtle);
  }
</style>
