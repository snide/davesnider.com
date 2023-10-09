<script lang="ts">
  import { onMount } from 'svelte';
  import { type FilesRecordWithThumbs } from '@localTypes/files';
  import FileRecordItem from '@components/files/list-file.svelte';
  import { debounce } from '@lib/debounce';
  import Loader from '@components/loader.svelte';

  export let isLoggedIn: boolean = false;

  import InfiniteScroll from '@components/infinite/infinite.svelte';
  let fetchedRecords: FilesRecordWithThumbs[] = [];
  export let FileRecords: FilesRecordWithThumbs[] = [];
  let page = 1;
  let isLoading = false;
  let isHidden = false;
  let isFavorite = true;
  let mediaType: 'image' | 'video' | 'all' | 'gif' = 'all';
  let sortOrder: 'asc' | 'desc' = 'asc';
  let filterPopoverIsOpen = false;

  // Dates and search need to be debounced
  let startDate: string = '2010-01-01';
  let endDate: string = new Date().toISOString().split('T')[0];
  let searchTerm = '';
  let debouncedSearchUpdate = debounce((term: string) => {
    searchTerm = term;
  }, 500);
  let debouncedStartDateUpdate = debounce((date: string) => {
    startDate = date;
  }, 1000);

  let debouncedEndDateUpdate = debounce((date: string) => {
    endDate = date;
  }, 1000);

  function handleEndDateInput(e: Event) {
    const inputElement = e.target as HTMLInputElement;
    endDate = inputElement.value;
    debouncedEndDateUpdate(inputElement.value);
  }

  function handleStartDateInput(e: Event) {
    const inputElement = e.target as HTMLInputElement;
    startDate = inputElement.value;
    debouncedStartDateUpdate(inputElement.value);
  }

  //  Fetch is used for the initial call, then appends more records during infinite scroll
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
      `&mediaType=${mediaType}` +
      `&sortOrder=${sortOrder}` +
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

  // Fetch immediately when the component is loaded
  onMount(async () => {
    fetchData();
  });

  // When the file record buttons are clicked, update the file record in the parent
  // This will updated the render of that file in the grid
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

  // We need to watch for changes in the filter controls and re-fetch the data
  let previousIsHidden = isHidden;
  let previousIsFavorite = isFavorite;
  let previousStartDate = startDate;
  let previousEndDate = endDate;
  let previousSearchTerm = searchTerm;
  let previousMediaType = mediaType;
  let previousSortOrder = sortOrder;
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

  $: if (mediaType !== previousMediaType) {
    page = 1;
    FileRecords = [];
    fetchData();
    previousMediaType = mediaType;
  }

  $: if (sortOrder !== previousSortOrder) {
    page = 1;
    FileRecords = [];
    fetchData();
    previousSortOrder = sortOrder;
  }

  let mediaTypes = ['image', 'gif', 'video', 'all'];
</script>

<div class="header">
  <div class="title">
    <h1>Museum</h1>

    {#if isLoading}
      <Loader />
    {/if}
  </div>

  <div class="filters">
    <input
      type="text"
      value={searchTerm}
      on:input={(e) => debouncedSearchUpdate(e.target.value)}
      placeholder="Search"
    />
    <button
      class="btn"
      on:click={() => {
        filterPopoverIsOpen = !filterPopoverIsOpen;
      }}
    >
      {filterPopoverIsOpen ? 'Hide' : 'Show'} filters
    </button>
  </div>
</div>

<div class="filterPopover" class:active={filterPopoverIsOpen}>
  {#if isLoggedIn}
    <label class="checkbox">
      <input type="checkbox" bind:checked={isHidden} /> Hidden
    </label>
    <label class="checkbox">
      <input type="checkbox" bind:checked={isFavorite} /> Favorites
    </label>
  {/if}

  <input type="date" value={startDate} on:input={handleStartDateInput} />
  ⥂
  <input type="date" value={endDate} on:input={handleEndDateInput} />

  <select bind:value={sortOrder}>
    <option value="asc">Ascending</option>
    <option value="desc">Descending</option>
  </select>

  <select bind:value={mediaType}>
    {#each mediaTypes as type}
      <option value={type}>{type || 'all'} files</option>
    {/each}
  </select>
</div>
<div class="grid">
  {#each FileRecords as FileRecord (FileRecord.id)}
    <FileRecordItem fileRecord={FileRecord} {isLoggedIn} {updateFileRecord} />
  {/each}
  {#if !isLoading}
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

{#if fetchedRecords.length === 0 && !isLoading && FileRecords.length !== 0}
  <p class="allFilesLoaded">All files loaded</p>
{/if}

<style>
  .header {
    display: flex;
    justify-content: space-between;
    padding-bottom: 1rem;
    align-items: end;
  }
  .title {
    display: flex;
    align-items: start;
    gap: 2rem;
    margin-bottom: 0.5rem !important;
  }
  h1 {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
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

  .filterPopover {
    display: none;
    gap: 1rem;
    margin-bottom: 2rem;
    align-items: center;
    justify-content: end;
  }

  .filterPopover.active {
    display: flex;
  }

  .allFilesLoaded {
    animation: fadein 0.5s;
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
    animation-delay: 1s;
    opacity: 0;
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
      align-items: start;
    }
    .header > .filters * {
      width: 100%;
    }
    .filters {
      flex-direction: column;
      align-items: start;
      padding-top: 1rem;
      width: 100%;
    }
    .filterPopover {
      flex-direction: column;
      align-items: start;
      width: 100%;
    }
    .filterPopover input[type='date'],
    .filterPopover select {
      width: 100%;
    }
  }
</style>
