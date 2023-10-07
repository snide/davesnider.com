<script lang="ts">
  async function handleLogout() {
    const response = await fetch('/api/logout', {
      method: 'POST'
    });

    if (response.ok) {
      console.log('Logged out successfully.');
      window.location.href = '/auth'; // Redirect to login or another appropriate page
    } else {
      console.error('Error logging out.');
    }
  }
</script>

<button class="btn" on:click={handleLogout}>Logout</button>
