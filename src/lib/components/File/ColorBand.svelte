<script lang="ts">
  import type { DominantColors } from '$db/schema';

  type Props = {
    colors: DominantColors;
  };

  let { colors }: Props = $props();

  const totalPct = $derived(colors.reduce((sum, c) => sum + c.pct, 0));
  const sortedColors = $derived(colors.toSorted((a, b) => b.pct - a.pct));
</script>

<div class="colorBand">
  {#each sortedColors as color}
    <div class="colorBand__color" style="--color: {color.hex}; --width: {(color.pct / totalPct) * 100}%"></div>
  {/each}
</div>

<style>
  .colorBand {
    display: flex;
    width: 100%;
  }

  .colorBand__color {
    background-color: var(--color);
    width: var(--width);
    min-width: 0.25rem;
    height: 1.5rem;
  }
</style>
