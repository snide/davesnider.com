<script lang="ts">
	import type { PageData } from './$types';
	import { animate } from '$lib/actions/animate';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Dave Snider</title>
	<meta
		name="description"
		content="Dave Snider is a chaotic good web designer based out of Annapolis, MD that builds in the browser."
	/>
</svelte:head>

<div class="homePage">
	<div class="homePage__hello">
		<h1 class="homePage__title">Hello, I'm <a href="/about">Dave</a></h1>
	</div>
	{#each data.posts as post}
		{#if post.metadata.image}
			<a href={`/posts/${post.slug}`} class="homePage__feedItem homePage__feedItem--hasImage" use:animate>
				<img src={post.metadata.image} alt={post.metadata.title} />
				<div class="homePage__imageInner">
					<h2>{post.metadata.title}</h2>
					<p>{post.metadata.description}</p>
				</div>
			</a>
		{:else}
			<a href={`/posts/${post.slug}`} class="homePage__feedItem" use:animate>
				<h2>{post.metadata.title}</h2>
				<p>{post.metadata.description}</p>
			</a>
		{/if}
	{/each}
</div>

<style>
	.homePage__feedItem {
		display: block;
		max-width: 40rem;
		margin: 0 auto;
		padding: 2rem;
		position: relative;
	}

	.homePage__feedItem:hover h2,
	.homePage__feedItem:focus h2 {
		background-color: var(--fg);
		color: var(--bg);
		outline: solid 4px var(--fg);
	}

	.homePage__feedItem--hasImage {
		margin: 0.5rem auto;
		background-position: center center;
		aspect-ratio: 3 / 2;
		padding: 0;
		max-width: 42rem;
		overflow: hidden;
	}

	.homePage__feedItem--hasImage img {
		transition: all 0.2s ease-in-out;
		filter: grayscale(100%);
		opacity: 1;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.homePage__feedItem--hasImage:hover img,
	.homePage__feedItem--hasImage:focus img {
		filter: none !important;
		opacity: 1 !important;
	}

	:global(html.dark) .homePage__feedItem--hasImage img,
	:global(html.light) .homePage__feedItem--hasImage img {
		filter: grayscale(100%);
	}

	.homePage__feedItem p {
		margin-top: 0.5rem;
		color: var(--subtle);
	}

	.homePage__imageInner {
		background: var(--bg);
		display: inline-block;
		height: auto;
		padding: 1rem;
		position: absolute;
		left: 2rem;
		bottom: 2rem;
		max-width: 66%;
	}

	.homePage__feedItem h2 {
		display: inline;
		font-size: 1.5rem;
		line-height: 1.1;
		margin-bottom: 0.5rem;
	}

	.homePage__hello {
		margin: 0 auto;
		max-width: 36rem;
	}

	.homePage__title {
		font-family: var(--displayFont);
		font-size: 3rem;
		line-height: 1;
		margin-bottom: 3rem !important;
		opacity: 1;
		animation-duration: 0.25s;
		animation-name: slidedown !important;
		animation-fill-mode: both;
		animation-timing-function: ease-in-out;
	}

	.homePage__hello a {
		text-decoration: underline;
	}

	.homePage__hello a:hover,
	.homePage__hello a:focus {
		background-color: var(--fg);
		color: var(--bg);
		outline: solid 4px var(--fg);
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

	@media (max-width: 768px) {
		.homePage__title {
			padding: 0 1rem;
		}
		.homePage__feedItem--hasImage {
			margin-left: -1rem;
			margin-right: -1rem;
		}
		.homePage__feedItem {
			padding-left: 1rem;
			padding-right: 1rem;
		}
		.homePage__imageInner {
			left: 0.5rem;
			bottom: 0.5rem;
			width: calc(100% - 1rem);
			padding: 1.5rem;
			max-width: 100%;
			right: 0.5rem;
		}
	}
</style>
