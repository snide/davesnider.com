<script lang="ts">
  import { debounce } from '@lib/debounce';
  import type { SelectLink } from '@db/schema';
  import Loader from '@components/loader.svelte';

  let searchTerm = '';
  export let fetchedRecords: SelectLink[] = [];
  let isLoading = false;

  let debouncedSearchUpdate = debounce((term: string) => {
    searchTerm = term;
    fetchLinks();
    console.log('searching for', searchTerm);
  }, 500);

  async function fetchLinks() {
    isLoading = true;
    const fetchUrl = `/api/links` + `?searchTerm=${searchTerm}`;
    const response = await fetch(fetchUrl, {
      method: 'GET',
      credentials: 'include'
    });
    fetchedRecords = await response.json();
    isLoading = false;
  }
</script>

<div class="links">
  <div class="links__header">
    <h1>Links</h1>
    <div class="links__search">
      <input
        type="text"
        value={searchTerm}
        placeholder="Search"
        on:input={(e) => debouncedSearchUpdate(e.target.value)}
      />
    </div>
  </div>
  {#if isLoading}
    <div class="links__loader">
      <Loader />
    </div>
    <Loader />
  {:else if fetchedRecords.length === 0}
    <p>No links found</p>
  {:else}
    <div class="links__list">
      {#each fetchedRecords as record}
        <a href={record.url} rel="noopener noreferrer" class="animate-item">
          <p class="title">
            {record.title}
          </p>
          <p class="comment">
            {record.comment}
          </p>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .links {
    max-width: 40rem;
    margin: 0 auto;
  }
  .links__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }
  .links__loader {
    padding-top: 2rem;
  }

  .links p {
    font-size: 1rem;
    color: var(--subtle);
  }
  .links h1 {
    font-family: var(--displayFont);
    line-height: 1.1;
    opacity: 1;
    font-size: 3rem;
    animation-duration: 0.25s;
    animation-name: slidedown !important;
    animation-fill-mode: both;
    animation-timing-function: ease-in-out;
  }

  .links__list {
    margin-left: 0;
    padding-left: 0;
    list-style: none;
  }

  .links__list a {
    padding: 1rem 0;
    display: block;
    color: var(--subtle);
    opacity: 1;
  }

  .links .comment {
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }

  .links a .title {
    display: inline-block;
    font-weight: 700;
    text-decoration: none;
    color: var(--fg);
  }

  .links__list a:hover .title {
    background-color: var(--fg);
    color: var(--bg);
    outline: solid 2px var(--fg);
  }

  @keyframes slidedown {
    from {
      opacity: 0;
      transform: translateY(-3rem);
    }

    to {
      opacity: 1;
    }
  }
</style>
