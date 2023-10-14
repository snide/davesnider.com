<script lang="ts">
  import { onMount } from 'svelte';
  import Loader from '@components/loader.svelte';
  let isLoading = false;
  let data: { x: string; y: number }[] = [];

  async function fetchHistogram() {
    isLoading = true;
    const response = await fetch(`/api/file/histogram.json`, {
      method: 'GET'
    });

    data = await response.json();
    console.log('this works', data);

    isLoading = false;
  }

  onMount(async () => {
    fetchHistogram();
  });

  console.log('this is empty', data);
</script>

<div class="chart-container">
  {#if data && data.length}
    <div class="barChart">
      {#each data as d, i}
        <button class="block" style="height: {d.y}px">
          <div class="bar">
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
    gap: 2px;
    max-height: 100vh;
    position: fixed;
    top: 0;
    right: 1rem;
  }
  .block {
    width: 5rem;
    border: none;
    background-color: transparent;
    max-height: 100vh;
    color: var(--textColor);
    display: flex;
    justify-content: flex-end;
    cursor: pointer;
    align-items: center;
  }
  .bar {
    background-color: var(--listMarker);
    width: 4px;
    position: relative;
    height: 100%;
  }
  .label {
    position: absolute;
    right: 100%;
    padding-right: 0.5rem;
    font-size: 0.5rem;
    white-space: nowrap;
    font-family: var(--codeFont);
  }
  .marker {
    visibility: hidden;
    position: absolute;
    right: 100%;
    padding-right: 0.5rem;
    font-size: 0.8rem;
    white-space: nowrap;
    font-family: var(--codeFont);
    background-color: var(--fg);
    color: var(--bg);
    padding: 0.1rem 0.2rem;
    display: inline-block;
  }
  .block:hover .marker {
    visibility: visible;
  }
  .block:hover .label {
    visibility: hidden;
  }
</style>
