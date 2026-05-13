<script lang="ts">
	import Loader from '$lib/components/StlViewer/Loader.svelte';

	type Props = {
		handleClick: (date: Date) => void;
		dateInView: string | null;
		sortOrder: 'asc' | 'desc';
		isHidden?: boolean;
		isFavorite?: boolean;
		mediaType?: 'image' | 'video' | 'model' | 'all';
	};

	let {
		handleClick,
		dateInView,
		sortOrder,
		isHidden = false,
		isFavorite = true,
		mediaType = 'all'
	}: Props = $props();

	let isLoading = $state(false);
	let data = $state<{ x: string; y: number }[]>([]);
	let highestValue = $derived(Math.max(...data.map((d) => d.y), 0));

	async function fetchHistogram() {
		isLoading = true;
		const response = await fetch(
			`/api/file/histogram?sortOrder=${sortOrder}&isHidden=${isHidden}&isFavorite=${isFavorite}&mediaType=${mediaType}`
		);
		data = await response.json();
		isLoading = false;
	}

	// Fetch on mount and refetch when filters change
	$effect(() => {
		// Access props to track them
		const _ = [isHidden, isFavorite, sortOrder, mediaType];
		fetchHistogram();
	});
</script>

<div class="histogram">
	{#if data && data.length}
		<div class="histogram__chart">
			{#each data as d}
				{@const dateStr = new Date(d.x).toLocaleString('en-US', { month: 'short', year: 'numeric' })}
				{@const isActive = dateInView === dateStr}
				{@const isJanuary = new Date(d.x).getMonth() === 0}
				<button
					class="histogram__block"
					class:histogram__block--active={isActive}
					onclick={() => handleClick(new Date(d.x))}
				>
					<div class="histogram__bar" style="width: {(d.y / highestValue) * 100}%">
						{#if isJanuary}
							<div class="histogram__label">
								{new Date(d.x).toLocaleString('en-US', { year: 'numeric' })}
							</div>
						{/if}
						<div class="histogram__marker">{dateStr}</div>
					</div>
				</button>
			{/each}
		</div>
	{:else if isLoading}
		<Loader />
	{/if}
</div>

<style>
	.histogram__chart {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 98vh;
		position: fixed;
		top: 1vh;
		right: 0.5rem;
	}

	.histogram__block {
		width: 4rem;
		border: none;
		background-color: transparent;
		height: 4px;
		color: var(--fg);
		display: flex;
		justify-content: flex-end;
		cursor: pointer;
		align-items: center;
		position: relative;
		padding: 0;
	}

	.histogram__bar {
		background: var(--visBg);
		width: 4px;
		height: 100%;
	}

	.histogram__label {
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

	.histogram__marker {
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

	.histogram__block--active .histogram__marker {
		visibility: visible;
	}

	.histogram__block--active .histogram__label {
		visibility: hidden;
	}

	@media (max-height: 800px) {
		.histogram__chart {
			gap: 1px;
		}
		.histogram__block {
			height: 3px;
		}
	}

	@media (max-width: 768px) {
		.histogram__chart {
			top: 5rem;
			max-height: calc(100vh - 5rem);
		}
	}

	@media (min-width: 768px) {
		.histogram__block:hover .histogram__marker {
			visibility: visible;
		}
		.histogram__block:hover .histogram__label {
			visibility: hidden;
		}
	}
</style>
