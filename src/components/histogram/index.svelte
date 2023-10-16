<script lang="ts">
  import { onMount } from 'svelte';
  import Loader from '@components/loader.svelte';
  export let handleClick;
  let isLoading = false;
  let data: { x: string; y: number }[] = [];
  export let dateInView: string;
  export let sortOrder: 'asc' | 'desc';
  export let isHidden: boolean = false;
  export let isFavorite: boolean = true;
  export let mediaType: 'image' | 'video' | 'all' | 'gif' = 'all';
  let highestValue = 0;

  async function fetchHistogram() {
    isLoading = true;
    const response = await fetch(
      `/api/file/histogram.json?sortOrder=${sortOrder}&isHidden=${isHidden}&isFavorite=${isFavorite}&mediaType=${mediaType}`,
      {
        method: 'GET'
      }
    );

    data = await response.json();
    highestValue = Math.max(...data.map((d) => d.y));

    isLoading = false;
  }

  onMount(async () => {
    fetchHistogram();
  });

  let previousIsHidden = isHidden;
  let previousIsFavorite = isFavorite;
  let previousSortOrder = sortOrder;
  let previousMediaType = mediaType;

  $: if (
    isHidden !== previousIsHidden ||
    isFavorite !== previousIsFavorite ||
    sortOrder !== previousSortOrder ||
    mediaType !== previousMediaType
  ) {
    fetchHistogram();
    previousIsHidden = isHidden;
    previousIsFavorite = isFavorite;
    previousSortOrder = sortOrder;
    previousMediaType = mediaType;
  }
</script>

<div class="chart-container">
  {#if data && data.length}
    <div class="barChart">
      {#each data as d}
        <button
          class={`block ${
            dateInView === new Date(d.x).toLocaleString('en-US', { month: 'short', year: 'numeric' }) && 'active'
          }`}
          style="height: 4px"
          on:click={() => handleClick(new Date(d.x))}
        >
          <div class="bar" style="width: {(d.y / highestValue) * 100}%">
            {#if new Date(d.x).getMonth() === 0}
              <div class="label">{new Date(d.x).toLocaleString('en-US', { year: 'numeric' })}</div>
            {/if}
            <div class="marker">
              {new Date(d.x).toLocaleString('en-US', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </button>
      {/each}
    </div>
  {:else if isLoading}
    <Loader />
  {/if}
</div>

<style>
  .barChart {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 98vh;
    position: fixed;
    top: 1vh;
    right: 0.5rem;
  }
  .block {
    width: 4rem;
    border: none;
    background-color: transparent;
    max-height: 100vh;
    color: var(--fg);
    display: flex;
    justify-content: flex-end;
    cursor: pointer;
    align-items: center;
    position: relative;
    padding: 0;
  }

  .bar {
    background: var(--visBg);
    width: 4px;
    height: 100%;
  }
  .label {
    position: absolute;
    right: 0;
    padding-right: 0.5rem;
    font-size: 0.6rem;
    white-space: nowrap;
    font-family: var(--codeFont);
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
  }
  .marker {
    visibility: hidden;
    position: absolute;
    right: 0;
    font-size: 0.7rem;
    white-space: nowrap;
    font-family: var(--codeFont);
    background-color: var(--fg);
    color: var(--bg);
    padding: 0.1rem 0.2rem;
    display: inline-block;
    top: 50%;
    transform: translateY(-50%);
    text-transform: uppercase;
    z-index: 2;
  }

  .block.active .marker {
    visibility: visible;
  }
  .block.active .label {
    visibility: hidden;
  }

  @media (max-width: 768px) {
    .barChart {
      top: 5rem;
      max-height: calc(100vh - 5rem);
    }
  }
  @media (min-width: 768px) {
    .block:hover .marker {
      visibility: visible;
    }
    .block:hover .label {
      visibility: hidden;
    }
  }
</style>
