<script lang="ts">
	import FileList from '$lib/components/File/FileList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Museum - Dave Snider</title>
	<meta name="description" content="Screenshots and video from the career of Dave Snider" />
	<meta name="robots" content="noindex" />
</svelte:head>

<FileList isLoggedIn={data.isLoggedIn} />
