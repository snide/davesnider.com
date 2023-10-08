<script lang="ts">
  import { onMount } from 'svelte';
  import { type FilesRecordWithThumbs } from '@localTypes/files';
  import FileRecordItem from '@components/files/list-file.svelte';
  import { debounce } from '@lib/debounce';

  export let isLoggedIn: boolean = false;

  import InfiniteScroll from '@components/infinite/infinite.svelte';
  let fetchedRecords: FilesRecordWithThumbs[] = [];
  export let FileRecords: FilesRecordWithThumbs[] = [];
  let page = 1;
  let isLoading = false;
  let isHidden = false;
  let isFavorite = true;
  let startDate: string = '2010-01-01';
  let endDate: string = new Date().toISOString().split('T')[0];
  let searchTerm = '';
  let debouncedSearchUpdate = debounce((term: string) => {
    searchTerm = term;
  }, 500);

  async function fetchData() {
    if (isLoading) {
      return;
    }
    isLoading = true;

    const fetchUrl =
      `/api/file/list/${page}` +
      `?isHidden=${isHidden}` +
      `&isFavorite=${isFavorite}` +
      `&startDate=${startDate}` +
      `&endDate=${endDate}` +
      `&searchTerm=${searchTerm}`;

    const response = await fetch(fetchUrl, {
      method: 'GET'
    });
    fetchedRecords = await response.json();
    console.log('fetched record length', fetchedRecords.length, fetchedRecords);

    // Directly append the fetched records to the FileRecords
    FileRecords = [...FileRecords, ...fetchedRecords];
    isLoading = false;
  }

  onMount(async () => {
    fetchData();
  });

  const updateFileRecord = (id: string, updatedFileRecord: FilesRecordWithThumbs | null) => {
    if (updatedFileRecord === null) {
      // Handle deletion or filtering out
      FileRecords = FileRecords.filter((record) => record.id !== id);
    } else {
      console.log('Updating file record in parent', updatedFileRecord);
      FileRecords = FileRecords.map((record) => {
        if (record.id === updatedFileRecord.id) {
          return updatedFileRecord;
        }
        return record;
      });
    }
  };

  //  $: FileRecords = [...FileRecords];
  let previousIsHidden = isHidden;
  let previousIsFavorite = isFavorite;
  let previousStartDate = startDate;
  let previousEndDate = endDate;
  let previousSearchTerm = searchTerm;
  $: if (isHidden !== previousIsHidden) {
    page = 1;
    FileRecords = [];
    fetchData();
    previousIsHidden = isHidden;
  }

  $: if (isFavorite !== previousIsFavorite) {
    page = 1;
    FileRecords = [];
    fetchData();
    previousIsFavorite = isFavorite;
  }

  $: if (startDate !== previousStartDate) {
    page = 1;
    FileRecords = [];
    fetchData();
    previousStartDate = startDate;
  }

  $: if (endDate !== previousEndDate) {
    page = 1;
    FileRecords = [];
    fetchData();
    previousEndDate = endDate;
  }

  $: if (searchTerm !== previousSearchTerm) {
    page = 1;
    FileRecords = [];
    fetchData();
    previousSearchTerm = searchTerm;
  }
</script>

<div class="header">
  <h1>Museum</h1>

  <div class="filters">
    {#if isLoggedIn}
      <label>
        <input type="checkbox" bind:checked={isHidden} /> Hidden
      </label>
      <label>
        <input type="checkbox" bind:checked={isFavorite} /> Favorites
      </label>
    {/if}
    <input type="date" bind:value={startDate} />
    ⥂
    <input type="date" bind:value={endDate} />

    <input
      type="text"
      value={searchTerm}
      on:input={(e) => debouncedSearchUpdate(e.target.value)}
      placeholder="Search term..."
    />
  </div>
</div>

<div class="grid">
  {#each FileRecords as FileRecord (FileRecord.id)}
    <FileRecordItem fileRecord={FileRecord} {isLoggedIn} {updateFileRecord} />
  {/each}
  {#if isLoading}
    <div>Loading...</div>
  {:else}
    <InfiniteScroll
      hasMore={fetchedRecords.length > 0}
      threshold={1000}
      horizontal={false}
      on:loadMore={() => {
        page++;
        fetchData();
      }}
    />
  {/if}
</div>

<h5>
  All items loaded: {fetchedRecords.length > 0 ? 'No' : 'Yes'}
</h5>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    padding-bottom: 1rem;
    align-items: end;
  }
  h1 {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
    margin-bottom: 0.5rem !important;
  }
  .grid {
    padding-left: 0;
    display: grid;
    width: 100%;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  .filters {
    display: flex;
    gap: 1rem;
    padding-bottom: 1rem;
    align-items: center;
  }
</style>
