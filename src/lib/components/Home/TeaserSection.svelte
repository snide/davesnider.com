<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    href: string;
    children: Snippet;
  }

  let { title, href, children }: Props = $props();
</script>

<section class="teaserSection">
  <h2 class="teaserSection__heading">
    <a {href} class="teaserSection__headingLink">{title} &rarr;</a>
  </h2>
  {@render children()}
</section>

<style>
  .teaserSection__heading {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.75rem;
  }

  .teaserSection__headingLink {
    color: var(--subtle);
  }

  .teaserSection__headingLink:hover,
  .teaserSection__headingLink:focus {
    background-color: var(--fg);
    color: var(--bg);
    outline: solid 4px var(--fg);
  }
</style>
