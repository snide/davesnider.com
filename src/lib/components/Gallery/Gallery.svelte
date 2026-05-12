<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		name: string;
	};

	type GalleryImage = {
		url: string;
		resizedUrl: string;
		width?: number;
		height?: number;
	};

	let { name }: Props = $props();
	let images = $state<GalleryImage[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const response = await fetch(`/api/gallery/${name}`);
			if (!response.ok) {
				throw new Error('Failed to fetch gallery');
			}
			const data = await response.json();
			images = data.images;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	});
</script>

<div class="gallery">
	{#if loading}
		<div class="gallery__loading">Loading gallery...</div>
	{:else if error}
		<div class="gallery__error">{error}</div>
	{:else}
		{#each images as image}
			<img
				src={image.resizedUrl}
				width={image.width}
				height={image.height}
				alt="Gallery image"
				loading="lazy"
			/>
		{/each}
	{/if}
</div>

<style>
	.gallery {
		width: 100%;
		max-width: 1200px;
		margin: 6rem auto !important;
	}

	.gallery__loading,
	.gallery__error {
		text-align: center;
		padding: 2rem;
		color: var(--subtle);
		font-family: var(--codeFont);
	}

	img {
		width: 100% !important;
		height: auto;
		margin-left: auto;
		margin-right: auto;
		margin-bottom: 0.5rem !important;
	}

	img:last-child {
		margin-bottom: 0;
	}
</style>
