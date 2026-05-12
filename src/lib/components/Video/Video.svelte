<script lang="ts">
	type Props = {
		source?: 'youtube' | 'vimeo';
		id: string;
	};

	let { source = 'youtube', id }: Props = $props();
</script>

<div class="video">
	{#if source === 'youtube'}
		<div class="video__wrap">
			<iframe
				src={`https://www.youtube.com/embed/${id}`}
				frameborder="0"
				loading="lazy"
				allowfullscreen
				title="YouTube video"
			></iframe>
		</div>
	{:else if source === 'vimeo'}
		<div class="video__wrap">
			<iframe
				src={`https://player.vimeo.com/video/${id}`}
				loading="lazy"
				frameborder="0"
				allowfullscreen
				title="Vimeo video"
			></iframe>
		</div>
	{/if}
</div>

<style>
	.video {
		width: 100%;
		max-width: 1200px;
		margin: 6rem auto !important;
	}

	.video__wrap {
		position: relative;
		overflow: hidden;
		padding-top: 56.25%;
		max-width: 100%;
	}

	.video iframe {
		position: absolute;
		top: 0;
		border: 0;
		height: 100%;
		width: 100%;
	}
</style>
