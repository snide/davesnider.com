<script lang="ts">
  import { autoUpdate, computePosition, offset, shift } from '@floating-ui/dom';
  import { RAIL_MONO_MIX, type DayComposition } from './palette';
  import { formatDay, typeNoun } from './railShared';

  type Props = {
    // The hovered day, or null to hide
    comp: DayComposition | null;
    // The hovered row element (vertical anchor)
    anchor: HTMLElement | null;
    // The rail's outermost element (horizontal anchor: tooltip sits to its left)
    rail: HTMLElement | null;
  };

  let { comp = null, anchor = null, rail = null }: Props = $props();

  let tooltipEl = $state<HTMLElement | null>(null);
  let x = $state(0);
  let y = $state(0);

  // Anchor rect: the rail's left edge at the hovered row's height, so
  // placement 'left' clears the date column no matter how wide it renders.
  function virtualReference(anchorEl: HTMLElement, railEl: HTMLElement) {
    return {
      getBoundingClientRect() {
        const row = anchorEl.getBoundingClientRect();
        const railRect = railEl.getBoundingClientRect();
        return new DOMRect(railRect.left, row.top, 0, row.height);
      },
      // Lets autoUpdate attach its observers to a real element
      contextElement: anchorEl
    };
  }

  $effect(() => {
    if (!comp || !anchor || !rail || !tooltipEl) return;
    const reference = virtualReference(anchor, rail);
    const floating = tooltipEl;
    async function position() {
      const result = await computePosition(reference, floating, {
        // The tooltip is position: fixed and the rail is a fixed element, so
        // positions are computed in viewport coordinates — page scroll must
        // not shift them.
        strategy: 'fixed',
        placement: 'left',
        middleware: [offset(8), shift({ padding: 8 })]
      });
      x = result.x;
      y = result.y;
    }
    return autoUpdate(reference, floating, position);
  });

  let breakdown = $derived(comp ? comp.counts.filter((c) => c.count > 0) : []);
</script>

{#if comp}
  <div class="railTooltip" bind:this={tooltipEl} style="left: {x}px; top: {y}px" role="tooltip">
    <div class="railTooltip__heading">
      <span class="railTooltip__day">{formatDay(comp.day)}</span>
      <span class="railTooltip__total">{comp.total} {comp.total === 1 ? 'event' : 'events'}</span>
    </div>
    {#each breakdown as entry (entry.type)}
      <div class="railTooltip__line">
        <span class="railTooltip__swatch" style="--swatchMix: {RAIL_MONO_MIX[entry.type]}"></span>
        <span class="railTooltip__type">{entry.type}</span>
        <span class="railTooltip__count">{entry.count} {typeNoun(entry.type, entry.count)}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .railTooltip {
    position: fixed;
    z-index: 10;
    pointer-events: none;
    background: var(--bg);
    border: 1px solid var(--fg);
    padding: 0.35rem 0.5rem;
    font-family: var(--codeFont);
    font-size: 0.65rem;
    text-transform: uppercase;
    color: var(--fg);
    min-width: 9rem;
  }

  .railTooltip__heading {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.3rem;
  }

  .railTooltip__total {
    color: var(--subtle);
  }

  .railTooltip__line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    line-height: 1.6;
  }

  .railTooltip__swatch {
    width: 0.5rem;
    height: 0.5rem;
    flex: none;
    background: color-mix(in srgb, var(--fg) calc(var(--swatchMix) * 1%), var(--bg));
  }

  .railTooltip__type {
    flex: 1;
  }

  .railTooltip__count {
    color: var(--subtle);
  }
</style>
