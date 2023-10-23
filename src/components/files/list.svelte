<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import { type FilesRecordWithThumbs } from '@localTypes/files';
  import FileRecordItem from '@components/files/list-file.svelte';
  import { debounce } from '@lib/debounce';
  import Loader from '@components/loader.svelte';
  import Histogram from '@components/histogram/index.svelte';

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
  let isInitialized = false;
  let dateInView: string | null = null;
  let observer: IntersectionObserver;

  // Dates and search need to be debounced
  let startDate: string = '2005-01-01';
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

  function resetAndFetch() {
    FileRecords = [];
    page = 1;
    fetchData();
  }

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

  // Save the state to the session so that it can be restored on subsequent visits
  function saveStateToSession() {
    const state = {
      isHidden,
      isFavorite,
      startDate,
      endDate,
      searchTerm,
      mediaType,
      sortOrder,
      scrollY: window.scrollY
    };
    sessionStorage.setItem('museumState', JSON.stringify(state));
  }

  // Load the state from the session
  function loadStateFromSession() {
    try {
      const savedState = JSON.parse(sessionStorage.getItem('museumState') as string);
      if (savedState) {
        isHidden = savedState.isHidden;
        isFavorite = savedState.isFavorite;
        startDate = savedState.startDate;
        endDate = savedState.endDate;
        searchTerm = savedState.searchTerm;
        mediaType = savedState.mediaType;
        sortOrder = savedState.sortOrder;
        if (typeof window !== 'undefined') {
          window.scrollTo(0, savedState.scrollY);
        }
      }
    } catch (error) {
      console.error('Error parsing session data:', error);
    }
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

    // Directly append the fetched records to the FileRecords
    FileRecords = [...FileRecords, ...fetchedRecords];
    isLoading = false;
  }

  // This is used to handle the click on the histogram
  function handleClick(date: Date) {
    if (sortOrder === 'asc') {
      startDate = date.toISOString().split('T')[0];
      endDate = new Date().toISOString().split('T')[0];
    } else {
      endDate = date.toISOString().split('T')[0];
      startDate = new Date('2005-01-01').toISOString().split('T')[0];
    }
    scrollTo(0, 0);
  }

  // This is used to observe the figures and update the dateInView
  function observeFigures() {
    const figures = document.querySelectorAll('figure[data-date]:not(.observed)');
    figures.forEach((figure) => {
      figure.classList.add('observed'); // Mark figure as observed
      observer.observe(figure);
    });
  }

  // Fetch immediately when the component is loaded
  onMount(() => {
    const queryParams = new URLSearchParams(window.location.search);

    // Check if there are any query parameters in the URL
    if (queryParams.toString()) {
      if (queryParams.has('isHidden')) isHidden = queryParams.get('isHidden') === 'true';
      if (queryParams.has('isFavorite')) isFavorite = queryParams.get('isFavorite') === 'true';
      if (queryParams.has('startDate')) startDate = queryParams.get('startDate') as string;
      if (queryParams.has('endDate')) endDate = queryParams.get('endDate') as string;
      if (queryParams.has('mediaType')) mediaType = queryParams.get('mediaType') as 'image' | 'video' | 'all' | 'gif';
      if (queryParams.has('sortOrder')) sortOrder = queryParams.get('sortOrder') as 'asc' | 'desc';
      if (queryParams.has('searchTerm')) searchTerm = queryParams.get('searchTerm') as string;

      // Save these to the session so that they can be restored in subsequent visits without the link
      saveStateToSession();
    } else {
      // If there are no query parameters, load from the session
      loadStateFromSession();
    }

    const options = {
      root: null,
      rootMargin: '-100px 0px 0px 0px',
      threshold: 0
    };

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          dateInView = new Date(entry.target.getAttribute('data-date')).toLocaleString('en-US', {
            month: 'short',
            year: 'numeric'
          });
        }
      });
    }, options);

    observeFigures();

    // Fetch immediately after processing query parameters or session data
    fetchData();
    isInitialized = true;
  });

  afterUpdate(() => {
    observeFigures();
  });

  // When the file record buttons are clicked, update the file record in the parent
  // This will updated the render of that file in the grid
  const updateFileRecord = (id: string, updatedFileRecord: FilesRecordWithThumbs | null) => {
    if (updatedFileRecord === null) {
      // Handle deletion or filtering out
      FileRecords = FileRecords.filter((record) => record.id !== id);
    } else {
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
  // Consolidated reactive statements
  $: if (
    isHidden !== previousIsHidden ||
    isFavorite !== previousIsFavorite ||
    startDate !== previousStartDate ||
    endDate !== previousEndDate ||
    searchTerm !== previousSearchTerm ||
    mediaType !== previousMediaType ||
    sortOrder !== previousSortOrder
  ) {
    resetAndFetch();
    previousIsHidden = isHidden;
    previousIsFavorite = isFavorite;
    previousStartDate = startDate;
    previousEndDate = endDate;
    previousSearchTerm = searchTerm;
    // @ts-ignore
    previousMediaType = mediaType;
    // @ts-ignore
    previousSortOrder = sortOrder;
  }

  $: {
    if (isInitialized) {
      const newUrl = `/museum?isHidden=${isHidden}&isFavorite=${isFavorite}&startDate=${startDate}&endDate=${endDate}&mediaType=${mediaType}&sortOrder=${sortOrder}&searchTerm=${searchTerm}`;
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', newUrl);
      }
    }
  }

  let mediaTypes = ['image', 'gif', 'video', 'all'];
</script>

<div class={`museum ${searchTerm !== '' && 'hasHistogram'}`}>
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
      <option value="asc">Old to New</option>
      <option value="desc">New to Old</option>
    </select>

    <select bind:value={mediaType}>
      {#each mediaTypes as type}
        <option value={type}>{type || 'all'} files</option>
      {/each}
    </select>
  </div>
  <div class="grid">
    {#if isLoading && FileRecords.length === 0}
      {#each Array.from({ length: 16 }, (_, i) => i + 1) as i}
        <FileRecordItem isSkeleton={true} />
      {/each}
    {/if}

    {#each FileRecords as FileRecord, index (FileRecord.id)}
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

  {#if isLoading && FileRecords.length > 0}
    <div class="loaderCenter"><Loader /></div>
  {/if}

  {#if fetchedRecords.length === 0 && !isLoading && FileRecords.length !== 0}
    <p class="allFilesLoaded">All files loaded</p>
  {/if}

  {#if searchTerm === ''}
    <Histogram {handleClick} {dateInView} {sortOrder} {isHidden} {isFavorite} {mediaType} />
  {/if}
</div>

<style>
  .museum {
    padding-right: 4rem;
  }

  .hasHistogram {
    padding-right: 0 !important;
  }

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
    gap: 2rem;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  .monthHeader {
    font-size: 1.5rem;
    padding: 1rem 0;
    grid-column: 1 / -1;
    font-family: var(--displayFont);
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

  .loaderCenter {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    padding-top: 2rem;
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
      align-items: start;
      margin-bottom: 0rem;
      padding-bottom: 0rem;
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
      margin-bottom: 1rem;
    }
    .filterPopover input[type='date'],
    .filterPopover select {
      width: 100%;
    }
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
    }
  }
</style>
