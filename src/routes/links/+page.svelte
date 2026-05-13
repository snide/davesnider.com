<script lang="ts">
	import type { PageData } from './$types';
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

<div class="links">
	<div class="links__header">
		<h1>Links</h1>
		<div class="links__search">
			<input type="text" placeholder="Search" bind:value={searchTerm} />
		</div>
	</div>

	{#if filteredLinks.length === 0}
		<p>No links found</p>
	{:else}
		<div class="links__list">
			{#each filteredLinks as link}
				<a href={link.url} rel="noopener noreferrer" use:animate>
					<p class="title">{link.title}</p>
					{#if link.comment}
						<p class="comment">{link.comment}</p>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.links {
		max-width: 40rem;
		margin: 0 auto;
	}

	.links__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.links p {
		font-size: 1rem;
		color: var(--subtle);
	}

	.links h1 {
		font-family: var(--displayFont);
		line-height: 1.1;
		opacity: 1;
		font-size: 3rem;
		animation-duration: 0.25s;
		animation-name: slidedown;
		animation-fill-mode: both;
		animation-timing-function: ease-in-out;
	}

	.links__list {
		margin-left: 0;
		padding-left: 0;
		list-style: none;
	}

	.links__list a {
		padding: 1rem 0;
		display: block;
		color: var(--subtle);
		opacity: 1;
	}

	.links .comment {
		font-size: 0.8rem;
		margin-top: 0.5rem;
	}

	.links a .title {
		display: inline-block;
		font-weight: 700;
		text-decoration: none;
		color: var(--fg);
	}

	.links__list a:hover .title {
		background-color: var(--fg);
		color: var(--bg);
		outline: solid 2px var(--fg);
	}

	@keyframes slidedown {
		from {
			opacity: 0;
			transform: translateY(-3rem);
		}
		to {
			opacity: 1;
		}
	}
</style>
