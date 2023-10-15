<script lang="ts">
  async function handleLogout() {
    const response = await fetch('/api/logout', {
      method: 'POST'
    });

    if (response.ok) {
      window.location.href = '/auth';
    } else {
      console.error('Error logging out.');
    }
  }
</script>

<button class="btn" on:click={handleLogout}>Logout</button>
