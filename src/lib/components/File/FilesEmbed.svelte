<script lang="ts">
	import { onMount } from 'svelte';
	import FileCard from './FileCard.svelte';

	type Props = {
		ids: string[];
		caption?: string;
	};

	type FileWithThumb = {
		fileId: string;
		url: string;
		fileTypeCategory: string;
		thumb: {
			url: string;
			resizedUrl: string;
			width?: number;
			height?: number;
		};
	};

	let { ids, caption }: Props = $props();
	let files = $state<FileWithThumb[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const response = await fetch('/api/files/embed', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			if (!response.ok) {
				throw new Error('Failed to fetch files');
			}
			const data = await response.json();
			files = data.files;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	});

	const gridClass = $derived(ids.length === 2 ? 'filesEmbed__grid--two' : '');
</script>

<div class="filesEmbed">
	{#if loading}
		<div class="filesEmbed__loading">Loading files...</div>
	{:else if error}
		<div class="filesEmbed__error">{error}</div>
	{:else}
		<div class="filesEmbed__grid {gridClass}">
			{#each files as file}
				<FileCard {file} />
			{/each}
		</div>
		{#if caption}
			<p class="filesEmbed__caption">{caption}</p>
		{/if}
	{/if}
</div>

<style>
	.filesEmbed {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		max-width: 1200px;
		width: 100%;
		margin: 6rem auto !important;
	}

	.filesEmbed__grid {
		display: grid;
		width: 100%;
		max-width: 100%;
		gap: 2rem;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		justify-content: center;
	}

	.filesEmbed__grid--two {
		grid-template-columns: repeat(2, 1fr);
	}

	.filesEmbed__caption {
		text-align: center;
		color: var(--fg);
		display: inline-block;
		font-family: var(--codeFont);
		padding: 0rem 0.25rem;
		font-size: 0.9rem;
		max-width: 20rem;
	}

	.filesEmbed__loading,
	.filesEmbed__error {
		text-align: center;
		padding: 2rem;
		color: var(--subtle);
		font-family: var(--codeFont);
	}
</style>
