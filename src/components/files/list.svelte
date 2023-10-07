<script lang="ts">
  import { onMount } from 'svelte';
  import { type FilesRecordWithThumbs } from '@localTypes/files';
  import FileRecordItem from '@components/files/list-file.svelte';

  export let isLoggedIn: boolean = false;

  import InfiniteScroll from '@components/infinite/infinite.svelte';
  let fetchedRecords: FilesRecordWithThumbs[] = [];
  export let FileRecords: FilesRecordWithThumbs[] = [];
  let page = 1;
  let isLoading = false;
  let isHidden = true;
  let isFavorite = false;
  let startDate: string = '2010-01-01T00:00:00Z';
  let endDate: string = new Date().toISOString();
  let searchTerm = '';

  async function fetchData() {
    if (isLoading) {
      return;
    }
    isLoading = true;

    const response = await fetch(`/api/file/list/${page}?isHidden=${isHidden}&isFavorite=${isFavorite}`, {
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
  <p>13 years, {FileRecords.length} memories</p>
</div>

<div class="filter-section">
  <label>
    <input type="checkbox" bind:checked={isHidden} /> Show hidden
  </label>
  <label>
    <input type="checkbox" bind:checked={isFavorite} /> Show favorites
  </label>
  Start Date: <input type="date" bind:value={startDate} />
  End Date: <input type="date" bind:value={endDate} />
  <input type="text" bind:value={searchTerm} placeholder="Search term..." />
</div>

<div class="grid">
  {#each FileRecords as FileRecord (FileRecord.id)}
    <FileRecordItem fileRecord={FileRecord} {isLoggedIn} {updateFileRecord} />
  {/each}
  <InfiniteScroll
    hasMore={fetchedRecords.length > 0}
    threshold={1000}
    horizontal={false}
    on:loadMore={() => {
      page++;
      fetchData();
    }}
  />
</div>

<h5>
  All items loaded: {fetchedRecords.length > 0 ? 'No' : 'Yes'}
</h5>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    padding-bottom: 1rem;
  }
  h1 {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
    margin-bottom: 0.5rem !important;
  }
  .grid {
    min-height: 100vh;
    padding-left: 0;
    display: grid;
    width: 100%;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
</style>
