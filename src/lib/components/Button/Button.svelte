<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    children: Snippet;
    size?: 'sm' | 'md';
    variant?: 'default' | 'ghost';
    href?: string;
    class?: string;
    onclick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  };

  let {
    children,
    size = 'md',
    variant = 'default',
    href,
    class: className,
    onclick,
    disabled,
    type = 'button'
  }: Props = $props();

  let classes = $derived(['btn', `btn--${size}`, `btn--${variant}`, className].filter(Boolean).join(' '));
</script>

{#if href}
  <a {href} class={classes}>
    {@render children()}
  </a>
{:else}
  <button class={classes} {onclick} {disabled} {type}>
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    background: var(--fg);
    color: var(--bg);
    border: none;
    font-family: 'BerkeleyMono', monospace;
    text-transform: uppercase;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
    width: fit-content;
  }

  .btn:hover {
    text-decoration: underline;
  }

  .btn:focus-visible {
    outline: none;
    text-decoration: underline;
  }

  .btn--md {
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
  }

  .btn--sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .btn--default {
    background: var(--fg);
    color: var(--bg);
  }

  .btn--ghost {
    background: transparent;
    color: var(--fg);
  }
</style>
