<script lang="ts">
	import type { PageData } from './$types';
	import { formatDate } from '$lib/utils/format-date';
	import { animate } from '$lib/actions/animate';

	let { data }: { data: PageData } = $props();
	let searchTerm = $state('');

	const filteredLinks = $derived(
		data.links.filter(
			(link) =>
				link.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
				link.comment?.toLowerCase().includes(searchTerm.toLowerCase()) ||
				link.url.toLowerCase().includes(searchTerm.toLowerCase())
		)
	);
</script>

<svelte:head>
	<title>Links - Dave Snider</title>
	<meta name="description" content="Bookmarks and links collected by Dave Snider" />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="linksPage">
	<div class="linksPage__header">
		<h1>Links</h1>
		<input
			type="text"
			placeholder="Search links..."
			bind:value={searchTerm}
			class="linksPage__search"
		/>
	</div>

	<div class="linksPage__list">
		{#each filteredLinks as link}
			<div class="linksPage__item" use:animate>
				<a href={link.url} target="_blank" rel="noopener noreferrer" class="linksPage__link">
					{link.title}
				</a>
				{#if link.comment}
					<p class="linksPage__comment">{link.comment}</p>
				{/if}
				<span class="linksPage__date">{formatDate(link.createdAt.toString())}</span>
			</div>
		{/each}
	</div>

	{#if filteredLinks.length === 0}
		<p class="linksPage__empty">No links found</p>
	{/if}
</div>

<style>
	.linksPage {
		max-width: 40rem;
		margin: 0 auto;
	}

	.linksPage__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		gap: 1rem;
	}

	.linksPage__header h1 {
		font-family: var(--displayFont);
		font-size: 3rem;
		line-height: 1.1;
	}

	.linksPage__search {
		flex: 1;
		max-width: 200px;
	}

	.linksPage__list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.linksPage__item {
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--fileBg);
	}

	.linksPage__link {
		font-size: 1.25rem;
		font-weight: 700;
		text-decoration: underline;
	}

	.linksPage__link:hover {
		background-color: var(--fg);
		color: var(--bg);
	}

	.linksPage__comment {
		color: var(--subtle);
		margin-top: 0.5rem;
	}

	.linksPage__date {
		font-family: var(--codeFont);
		font-size: 0.75rem;
		color: var(--subtle);
	}

	.linksPage__empty {
		text-align: center;
		color: var(--subtle);
		padding: 2rem;
	}

	@media (max-width: 768px) {
		.linksPage__header {
			flex-direction: column;
			align-items: flex-start;
		}
		.linksPage__search {
			max-width: 100%;
			width: 100%;
		}
	}
</style>
