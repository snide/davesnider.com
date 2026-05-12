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
		hasMore: boolean;
		isHidden: boolean;
		isFavorite: boolean;
		mediaType: 'image' | 'video' | 'model' | 'all';
		sortOrder: 'asc' | 'desc';
		searchTerm: string;
		startDate: string;
		endDate: string;
		scrollY: number;
	};

	const STORAGE_KEY = 'museumState';

	let { isLoggedIn = false }: Props = $props();

	let files = $state<FileWithThumb[]>([]);
	let page = $state(1);
	let isLoading = $state(false);
	let hasMore = $state(true);
	let isHidden = $state(false);
	let isFavorite = $state(true);
	let mediaType = $state<'image' | 'video' | 'model' | 'all'>('all');
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let searchTerm = $state('');
	let startDate = $state('2005-01-01');
	let endDate = $state(new Date().toISOString().split('T')[0]);
	let filterPopoverIsOpen = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout>;
	let dateInView = $state<string | null>(null);
	let restoredFromSession = false;

	function saveStateToSession() {
		const state: MuseumState = {
			files,
			page,
			hasMore,
			isHidden,
			isFavorite,
			mediaType,
			sortOrder,
			searchTerm,
			startDate,
			endDate,
			scrollY: window.scrollY
		};
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}

	async function restoreStateFromSession(): Promise<boolean> {
		try {
			const saved = sessionStorage.getItem(STORAGE_KEY);
			if (!saved) return false;

			const state: MuseumState = JSON.parse(saved);
			files = state.files;
			page = state.page;
			hasMore = state.hasMore;
			isHidden = state.isHidden;
			isFavorite = state.isFavorite;
			mediaType = state.mediaType;
			sortOrder = state.sortOrder;
			searchTerm = state.searchTerm;
			startDate = state.startDate;
			endDate = state.endDate;

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
		if (sortOrder === 'asc') {
			startDate = date.toISOString().split('T')[0];
			endDate = new Date().toISOString().split('T')[0];
		} else {
			endDate = date.toISOString().split('T')[0];
			startDate = '2005-01-01';
		}
		resetAndFetch();
		window.scrollTo(0, 0);
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
			files = [...files, ...newFiles];
		}
		isLoading = false;
	}

	function resetAndFetch() {
		files = [];
		page = 1;
		hasMore = true;
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

	function handleScroll() {
		if (!hasMore || isLoading) return;
		const scrollBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000;
		if (scrollBottom) {
			page++;
			fetchData();
		}
	}

	// Save state before navigating away
	beforeNavigate(() => {
		saveStateToSession();
	});

	onMount(async () => {
		// Try to restore from session first (for back navigation)
		restoredFromSession = await restoreStateFromSession();

		// If not restored, fetch fresh data
		if (!restoredFromSession) {
			fetchData();
		}

		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<div class="fileList" class:fileList--noHistogram={searchTerm !== ''}>
	<div class="fileList__header">
		<div class="fileList__title">
			<h1>Museum</h1>
			{#if isLoading}
				<Loader />
			{/if}
		</div>

		<div class="fileList__filters">
			<input type="text" value={searchTerm} oninput={handleSearchInput} placeholder="Search" />
			<button class="btn" onclick={() => (filterPopoverIsOpen = !filterPopoverIsOpen)}>
				{filterPopoverIsOpen ? 'Hide' : 'Show'} filters
			</button>
		</div>
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
					/> Hidden
				</label>
				<label class="checkbox">
					<input
						type="checkbox"
						checked={isFavorite}
						onchange={() => {
							isFavorite = !isFavorite;
							resetAndFetch();
						}}
					/> Favorites
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

	<div class="fileList__grid">
		{#if isLoading && files.length === 0}
			{#each Array(16)}
				<div class="fileList__skeleton"></div>
			{/each}
		{/if}

		{#each files as file (file.id)}
			<FileCard {file} />
		{/each}
	</div>

	{#if isLoading && files.length > 0}
		<div class="fileList__loaderCenter"><Loader /></div>
	{/if}

	{#if !hasMore && !isLoading && files.length > 0}
		<p class="fileList__allLoaded">All files loaded</p>
	{/if}

	{#if searchTerm === ''}
		<Histogram
			handleClick={handleHistogramClick}
			{dateInView}
			{sortOrder}
			{isHidden}
			{isFavorite}
			{mediaType}
		/>
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
		justify-content: space-between;
		padding-bottom: 1rem;
		align-items: end;
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
		margin-bottom: 2rem;
		align-items: center;
		justify-content: end;
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

	.fileList__loaderCenter {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		padding-top: 2rem;
	}

	@keyframes fadein {
		to {
			opacity: 1;
		}
	}

	@media (max-width: 768px) {
		.fileList {
			padding-right: 0;
		}
		.fileList__header {
			flex-direction: column;
			align-items: start;
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
