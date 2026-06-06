<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import Loader from '$lib/components/StlViewer/Loader.svelte';
  import FileCard from './FileCard.svelte';
  import Histogram from '$lib/components/Histogram/Histogram.svelte';

  type Props = {
    isLoggedIn?: boolean;
  };

  type FileWithThumb = {
    id: number;
    fileId: string;
    url: string;
    fileTypeCategory: string;
    originalUploadDate: string;
    isHidden: boolean;
    isFavorite: boolean;
    thumb: {
      url: string;
      resizedUrl: string;
      width?: number;
      height?: number;
    };
  };

  type MuseumState = {
    files: FileWithThumb[];
    page: number;
    pageUp: number;
    hasMore: boolean;
    hasMoreUp: boolean;
    isHidden: boolean;
    isFavorite: boolean;
    mediaType: 'image' | 'video' | 'model' | 'all';
    sortOrder: 'asc' | 'desc';
    searchTerm: string;
    startDate: string;
    endDate: string;
    scrollY: number;
    anchorDate: string | null;
  };

  const STORAGE_KEY = 'museumState';
  const EARLIEST_DATE = '2005-01-01';

  let { isLoggedIn = false }: Props = $props();

  let files = $state<FileWithThumb[]>([]);
  let page = $state(1);
  let pageUp = $state(0);
  let isLoading = $state(false);
  let isLoadingUp = $state(false);
  let hasMore = $state(true);
  let hasMoreUp = $state(false);
  let isHidden = $state(false);
  let isFavorite = $state(true);
  let mediaType = $state<'image' | 'video' | 'model' | 'all'>('all');
  let sortOrder = $state<'asc' | 'desc'>('asc');
  let searchTerm = $state('');
  let startDate = $state(EARLIEST_DATE);
  let endDate = $state(new Date().toISOString().split('T')[0]);
  let filterPopoverIsOpen = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout>;
  let dateInView = $state<string | null>(null);
  let restoredFromSession = false;
  let anchorDate = $state<string | null>(null);
  let gridElement: HTMLDivElement;
  let observer: IntersectionObserver;
  let isPositioning = false; // Prevent scroll handler during initial positioning

  // Helper to merge files without duplicates
  function mergeFiles(existing: FileWithThumb[], newFiles: FileWithThumb[], prepend = false): FileWithThumb[] {
    const existingIds = new Set(existing.map((f) => f.id));
    const uniqueNewFiles = newFiles.filter((f) => !existingIds.has(f.id));
    return prepend ? [...uniqueNewFiles, ...existing] : [...existing, ...uniqueNewFiles];
  }

  function saveStateToSession() {
    const state: MuseumState = {
      files,
      page,
      pageUp,
      hasMore,
      hasMoreUp,
      isHidden,
      isFavorite,
      mediaType,
      sortOrder,
      searchTerm,
      startDate,
      endDate,
      scrollY: window.scrollY,
      anchorDate
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  async function restoreStateFromSession(): Promise<boolean> {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return false;

      const state: MuseumState = JSON.parse(saved);
      // Deduplicate files in case session has duplicates
      const seen = new Set<number>();
      files = state.files.filter((f) => {
        if (seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });
      page = state.page;
      pageUp = state.pageUp || 0;
      hasMore = state.hasMore;
      hasMoreUp = state.hasMoreUp || false;
      isHidden = state.isHidden;
      isFavorite = state.isFavorite;
      mediaType = state.mediaType;
      sortOrder = state.sortOrder;
      searchTerm = state.searchTerm;
      startDate = state.startDate;
      endDate = state.endDate;
      anchorDate = state.anchorDate || null;

      // Wait for DOM to update with restored files
      await tick();

      // Restore scroll position
      window.scrollTo(0, state.scrollY);

      return true;
    } catch (error) {
      console.error('Error restoring session:', error);
      return false;
    }
  }

  function handleHistogramClick(date: Date) {
    const clickedDateStr = date.toISOString().split('T')[0];

    // Check if any files from this month are already loaded
    const clickedMonth = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    const existingFileIndex = files.findIndex((f) => {
      const fileDate = new Date(f.originalUploadDate);
      return fileDate.toLocaleString('en-US', { month: 'short', year: 'numeric' }) === clickedMonth;
    });

    if (existingFileIndex !== -1) {
      // Files for this month exist, scroll to that position
      const fileCards = gridElement?.querySelectorAll('.fileCard');
      if (fileCards && fileCards[existingFileIndex]) {
        fileCards[existingFileIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Files not loaded - set anchor date and load files around this date
    anchorDate = clickedDateStr;

    // Set date range to allow scrolling both directions
    if (sortOrder === 'asc') {
      // For ascending (old to new), set start to beginning so we can scroll up
      startDate = EARLIEST_DATE;
      endDate = new Date().toISOString().split('T')[0];
    } else {
      // For descending (new to old), same range
      startDate = EARLIEST_DATE;
      endDate = new Date().toISOString().split('T')[0];
    }

    // Reset and fetch starting from anchor
    files = [];
    page = 1;
    pageUp = 0;
    hasMore = true;
    hasMoreUp = true;
    sessionStorage.removeItem(STORAGE_KEY);
    fetchDataFromAnchor(clickedDateStr);
  }

  async function fetchData() {
    if (isLoading) return;
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

    const response = await fetch(fetchUrl);
    const newFiles = await response.json();

    if (newFiles.length === 0) {
      hasMore = false;
    } else {
      files = mergeFiles(files, newFiles);
    }
    isLoading = false;
  }

  async function fetchDataFromAnchor(anchorDateStr: string) {
    if (isLoading) return;
    isLoading = true;

    // First, fetch files BEFORE the anchor date (for upward scrolling)
    const beforeUrl =
      `/api/file/list/1` +
      `?isHidden=${isHidden}` +
      `&isFavorite=${isFavorite}` +
      `&startDate=${sortOrder === 'asc' ? EARLIEST_DATE : anchorDateStr}` +
      `&endDate=${sortOrder === 'asc' ? anchorDateStr : new Date().toISOString().split('T')[0]}` +
      `&mediaType=${mediaType}` +
      `&sortOrder=${sortOrder === 'asc' ? 'desc' : 'asc'}` + // Reverse to get closest files first
      `&searchTerm=${searchTerm}`;

    const beforeResponse = await fetch(beforeUrl);
    let beforeFiles: FileWithThumb[] = await beforeResponse.json();
    // Reverse back to correct order
    beforeFiles = beforeFiles.reverse();

    // Then, fetch files FROM the anchor date (for downward scrolling)
    const afterUrl =
      `/api/file/list/${page}` +
      `?isHidden=${isHidden}` +
      `&isFavorite=${isFavorite}` +
      `&startDate=${sortOrder === 'asc' ? anchorDateStr : EARLIEST_DATE}` +
      `&endDate=${sortOrder === 'asc' ? new Date().toISOString().split('T')[0] : anchorDateStr}` +
      `&mediaType=${mediaType}` +
      `&sortOrder=${sortOrder}` +
      `&searchTerm=${searchTerm}`;

    const afterResponse = await fetch(afterUrl);
    const afterFiles: FileWithThumb[] = await afterResponse.json();

    if (afterFiles.length === 0) {
      hasMore = false;
    }

    // Combine: before files + after files (merge removes duplicates)
    const anchorIndex = beforeFiles.length;
    files = mergeFiles(beforeFiles, afterFiles);

    isLoading = false;

    // Enable upward scrolling if we got files before the anchor
    hasMoreUp = beforeFiles.length > 0;

    // Wait for DOM to update, then scroll to anchor position
    await tick();

    isPositioning = true;
    if (anchorIndex > 0) {
      const fileCards = gridElement?.querySelectorAll('.fileCard');
      if (fileCards && fileCards[anchorIndex]) {
        fileCards[anchorIndex].scrollIntoView({ behavior: 'instant', block: 'start' });
        // Add a small offset so we're not at the very top
        window.scrollBy(0, -100);
      }
    } else {
      window.scrollTo(0, 0);
    }
    // Allow scroll handler after positioning is complete
    setTimeout(() => {
      isPositioning = false;
    }, 200);
  }

  async function fetchDataUp() {
    if (isLoadingUp || !hasMoreUp || files.length === 0) return;
    isLoadingUp = true;

    // Get the earliest/latest file date depending on sort order
    const boundaryFile = files[0];
    const boundaryDate = new Date(boundaryFile.originalUploadDate);

    // Calculate the date range for fetching earlier files
    let upStartDate: string;
    let upEndDate: string;

    if (sortOrder === 'asc') {
      // For ascending, we need files BEFORE the first file's date
      upEndDate = new Date(boundaryDate.getTime() - 1).toISOString().split('T')[0];
      upStartDate = EARLIEST_DATE;
    } else {
      // For descending, we need files AFTER the first file's date
      upStartDate = new Date(boundaryDate.getTime() + 1).toISOString().split('T')[0];
      upEndDate = new Date().toISOString().split('T')[0];
    }

    pageUp++;

    const fetchUrl =
      `/api/file/list/${pageUp}` +
      `?isHidden=${isHidden}` +
      `&isFavorite=${isFavorite}` +
      `&startDate=${upStartDate}` +
      `&endDate=${upEndDate}` +
      `&mediaType=${mediaType}` +
      `&sortOrder=${sortOrder === 'asc' ? 'desc' : 'asc'}` + // Reverse sort to get files nearest to boundary first
      `&searchTerm=${searchTerm}`;

    const response = await fetch(fetchUrl);
    let newFiles: FileWithThumb[] = await response.json();

    if (newFiles.length === 0) {
      hasMoreUp = false;
    } else {
      // Reverse the files back to correct order and prepend
      newFiles = newFiles.reverse();

      // Save scroll position before prepending
      const scrollHeightBefore = document.body.scrollHeight;
      const scrollYBefore = window.scrollY;

      files = mergeFiles(files, newFiles, true);

      // Wait for DOM update
      await tick();

      // Restore scroll position accounting for new content
      const scrollHeightAfter = document.body.scrollHeight;
      const heightDiff = scrollHeightAfter - scrollHeightBefore;
      window.scrollTo(0, scrollYBefore + heightDiff);
    }
    isLoadingUp = false;
  }

  function resetAndFetch() {
    files = [];
    page = 1;
    pageUp = 0;
    hasMore = true;
    hasMoreUp = false;
    anchorDate = null;
    // Clear session when filters change
    sessionStorage.removeItem(STORAGE_KEY);
    fetchData();
  }

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchTerm = target.value;
      resetAndFetch();
    }, 500);
  }

  let scrollDebounce: ReturnType<typeof setTimeout>;
  function handleScroll() {
    if (isPositioning) return; // Don't trigger during initial positioning
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      if (isPositioning) return;
      // Downward scroll - load more files
      if (hasMore && !isLoading) {
        const scrollBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000;
        if (scrollBottom) {
          page++;
          if (anchorDate) {
            // Continue from anchor position
            const anchorDateStr = anchorDate;
            const fetchUrl =
              `/api/file/list/${page}` +
              `?isHidden=${isHidden}` +
              `&isFavorite=${isFavorite}` +
              `&startDate=${sortOrder === 'asc' ? anchorDateStr : EARLIEST_DATE}` +
              `&endDate=${sortOrder === 'asc' ? new Date().toISOString().split('T')[0] : anchorDateStr}` +
              `&mediaType=${mediaType}` +
              `&sortOrder=${sortOrder}` +
              `&searchTerm=${searchTerm}`;

            isLoading = true;
            fetch(fetchUrl)
              .then((res) => res.json())
              .then((newFiles) => {
                if (newFiles.length === 0) {
                  hasMore = false;
                } else {
                  files = mergeFiles(files, newFiles);
                }
                isLoading = false;
              });
          } else {
            fetchData();
          }
        }
      }

      // Upward scroll - load earlier files
      if (hasMoreUp && !isLoadingUp) {
        const scrollTop = window.scrollY < 200;
        if (scrollTop) {
          fetchDataUp();
        }
      }
    }, 100);
  }

  function setupIntersectionObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const dateAttr = (entry.target as HTMLElement).getAttribute('data-date');
            if (dateAttr) {
              const date = new Date(dateAttr);
              dateInView = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
            }
          }
        });
      },
      {
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0
      }
    );

    // Observe all file cards
    const fileCards = gridElement?.querySelectorAll('.fileCard');
    fileCards?.forEach((card) => observer.observe(card));
  }

  // Re-observe when files change
  let observerTimeout: ReturnType<typeof setTimeout>;
  $effect(() => {
    if (files.length > 0 && gridElement) {
      // Clear previous timeout to avoid stacking
      clearTimeout(observerTimeout);
      // Small delay to ensure DOM is updated
      observerTimeout = setTimeout(setupIntersectionObserver, 100);
    }
    return () => clearTimeout(observerTimeout);
  });

  // Save state before navigating away
  beforeNavigate(() => {
    saveStateToSession();
  });

  onMount(() => {
    // Try to restore from session first (for back navigation)
    restoreStateFromSession().then((restored) => {
      restoredFromSession = restored;
      // If not restored, fetch fresh data
      if (!restoredFromSession) {
        fetchData();
      }
    });

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (observer) {
        observer.disconnect();
      }
    };
  });
</script>

<div class="fileList" class:fileList--noHistogram={searchTerm !== ''}>
  <div class="fileList__header">
    <div class="fileList__title">
      <h1>Museum</h1>
      {#if isLoading || isLoadingUp}
        <Loader />
      {/if}
    </div>

    <div class="fileList__filters">
      <input type="text" value={searchTerm} oninput={handleSearchInput} placeholder="Search" />
      <button class="btn" onclick={() => (filterPopoverIsOpen = !filterPopoverIsOpen)}>
        {filterPopoverIsOpen ? 'Hide' : 'Show'} filters
      </button>
    </div>

    {#if filterPopoverIsOpen}
      <div class="fileList__filterPopover">
        {#if isLoggedIn}
          <label class="checkbox">
            <input
              type="checkbox"
              checked={isHidden}
              onchange={() => {
                isHidden = !isHidden;
                resetAndFetch();
              }}
            />
            Hidden
          </label>
          <label class="checkbox">
            <input
              type="checkbox"
              checked={isFavorite}
              onchange={() => {
                isFavorite = !isFavorite;
                resetAndFetch();
              }}
            />
            Favorites
          </label>
        {/if}

        <input
          type="date"
          value={startDate}
          onchange={(e) => {
            startDate = (e.target as HTMLInputElement).value;
            resetAndFetch();
          }}
        />
        <span>→</span>
        <input
          type="date"
          value={endDate}
          onchange={(e) => {
            endDate = (e.target as HTMLInputElement).value;
            resetAndFetch();
          }}
        />

        <select
          value={sortOrder}
          onchange={(e) => {
            sortOrder = (e.target as HTMLSelectElement).value as 'asc' | 'desc';
            resetAndFetch();
          }}
        >
          <option value="asc">Old to New</option>
          <option value="desc">New to Old</option>
        </select>

        <select
          value={mediaType}
          onchange={(e) => {
            mediaType = (e.target as HTMLSelectElement).value as 'image' | 'video' | 'model' | 'all';
            resetAndFetch();
          }}
        >
          <option value="all">All files</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="model">Models</option>
        </select>
      </div>
    {/if}
  </div>

  <div class="fileList__grid" bind:this={gridElement}>
    {#if isLoading && files.length === 0}
      {#each Array(16)}
        <div class="fileList__skeleton"></div>
      {/each}
    {/if}

    {#each files as file (file.id)}
      <FileCard
        {file}
        {isLoggedIn}
        onAction={(fileId, action, updatedFile) => {
          if (action === 'delete') {
            files = files.filter((f) => f.fileId !== fileId);
          } else {
            files = files.map((f) =>
              f.fileId === fileId ? { ...f, isHidden: updatedFile.isHidden, isFavorite: updatedFile.isFavorite } : f
            );
          }
        }}
      />
    {/each}
  </div>

  {#if !hasMore && !isLoading && files.length > 0}
    <p class="fileList__allLoaded">All files loaded</p>
  {/if}

  {#if searchTerm === ''}
    <Histogram handleClick={handleHistogramClick} {dateInView} {sortOrder} {isHidden} {isFavorite} {mediaType} />
  {/if}
</div>

<style>
  .fileList {
    padding-right: 4rem;
  }

  .fileList--noHistogram {
    padding-right: 0;
  }

  .fileList__header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    padding-bottom: 1rem;
    align-items: end;
    position: sticky;
    top: 0;
    background-color: var(--bg);
    z-index: 10;
    padding-top: 4.8rem;
    margin-top: -4.8rem;
  }

  .fileList__title {
    display: flex;
    align-items: start;
    gap: 2rem;
    margin-bottom: 0.5rem !important;
  }

  .fileList__title h1 {
    font-family: var(--displayFont);
    font-size: 3rem;
    line-height: 1.1;
  }

  .fileList__grid {
    padding-left: 0;
    display: grid;
    width: 100%;
    gap: 2rem;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }

  .fileList__skeleton {
    background-color: var(--fileBg);
    aspect-ratio: 1;
  }

  .fileList__filters {
    display: flex;
    gap: 1rem;
    padding-bottom: 1rem;
    align-items: center;
  }

  .fileList__filterPopover {
    display: flex;
    gap: 1rem;
    padding-top: 1rem;
    padding-bottom: 1rem;
    align-items: center;
    justify-content: end;
    width: 100%;
  }

  .fileList__allLoaded {
    animation: fadein 0.5s;
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
    animation-delay: 1s;
    opacity: 0;
    text-align: center;
    padding: 2rem;
    color: var(--subtle);
  }

  @keyframes fadein {
    to {
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .fileList__header {
      flex-direction: column;
      align-items: start;
      padding-top: 3rem;
      margin-top: -3rem;
      position: static;
    }
    .fileList__filters {
      flex-direction: column;
      align-items: start;
      padding-top: 1rem;
      width: 100%;
    }
    .fileList__filters input,
    .fileList__filters button {
      width: 100%;
    }
    .fileList__filterPopover {
      flex-direction: column;
      align-items: start;
      width: 100%;
    }
    .fileList__filterPopover input[type='date'],
    .fileList__filterPopover select {
      width: 100%;
    }
    .fileList__grid {
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
    }
  }
</style>
