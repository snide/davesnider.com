<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    caption?: string;
    layout?: number[];
    children: Snippet;
  };

  let { caption, layout, children }: Props = $props();

  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

  // Columns are the LCM of the per-row item counts so every row divides evenly
  const columns = $derived(layout ? layout.reduce(lcm, 1) : 0);
  const spans = $derived(layout ? layout.flatMap((count) => Array(count).fill(columns / count)) : []);
  const layoutStyle = $derived(
    layout ? `--sgCols: ${columns}; ${spans.map((span, i) => `--sgSpan${i + 1}: ${span}`).join('; ')}` : undefined
  );
</script>

<figure class="splitGrid">
  <div class="splitGrid__items" class:splitGrid__items--layout={layout} style={layoutStyle}>
    {@render children()}
  </div>
  {#if caption}
    <figcaption class="splitGrid__caption">{caption}</figcaption>
  {/if}
</figure>

<style>
  .splitGrid {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
  }

  .splitGrid__items {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 1.5rem;
    align-items: stretch;
  }

  .splitGrid__items--layout {
    grid-auto-flow: row;
    grid-auto-columns: unset;
    grid-template-columns: repeat(var(--sgCols, 1), minmax(0, 1fr));
  }

  .splitGrid__items--layout > :global(*:nth-child(1)) {
    grid-column: span var(--sgSpan1, 1);
  }

  .splitGrid__items--layout > :global(*:nth-child(2)) {
    grid-column: span var(--sgSpan2, 1);
  }

  .splitGrid__items--layout > :global(*:nth-child(3)) {
    grid-column: span var(--sgSpan3, 1);
  }

  .splitGrid__items--layout > :global(*:nth-child(4)) {
    grid-column: span var(--sgSpan4, 1);
  }

  .splitGrid__items--layout > :global(*:nth-child(5)) {
    grid-column: span var(--sgSpan5, 1);
  }

  .splitGrid__items--layout > :global(*:nth-child(6)) {
    grid-column: span var(--sgSpan6, 1);
  }

  .splitGrid__items > :global(*) {
    min-width: 0;
  }

  .splitGrid__caption {
    font-size: 0.875rem;
    font-family: var(--codeFont);
    text-align: center;
    color: var(--subtle);
  }

  @media (max-width: 768px) {
    .splitGrid__items {
      grid-auto-flow: row;
    }

    .splitGrid__items--layout {
      grid-template-columns: 1fr;
    }

    .splitGrid__items--layout > :global(*:nth-child(n)) {
      grid-column: auto;
    }
  }
</style>
