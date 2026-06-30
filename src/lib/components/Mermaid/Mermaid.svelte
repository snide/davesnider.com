<script lang="ts">
  import { mode } from 'mode-watcher';

  type Props = {
    chart: string;
    caption?: string;
  };

  let { chart, caption }: Props = $props();

  // Unique id per instance so multiple diagrams can coexist on a page.
  const id = `mermaid-${Math.random().toString(36).slice(2)}`;

  let container = $state<HTMLDivElement>();

  // Pull the live theme values straight from the site's CSS variables so the
  // diagram always tracks whatever the rest of the page is using.
  function readVar(name: string, fallback: string) {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  async function renderChart() {
    if (typeof window === 'undefined' || !container) return;

    const { default: mermaid } = await import('mermaid');

    const fg = readVar('--fg', '#000');
    const bg = readVar('--bg', '#e5e5e5');
    const subtle = readVar('--subtle', '#222');
    const node = readVar('--navBg', '#fff');
    const marker = readVar('--visBg', '#aaa');
    const accent = readVar('--shiki-token-link', '#ee0000');
    const codeFont = readVar('--codeFont', "'BerkeleyMono', monospace");

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      fontFamily: codeFont,
      flowchart: {
        // Pad the subgraph title so it sits off the top border, matching the
        // breathing room at the bottom of the cluster.
        subGraphTitleMargin: { top: 8, bottom: 16 }
      },
      themeVariables: {
        background: 'transparent',
        fontFamily: codeFont,
        fontSize: '14px',
        // Nodes (flowchart node fill is driven by mainBkg, not nodeBkg)
        mainBkg: node,
        nodeBorder: marker,
        primaryColor: node,
        primaryBorderColor: fg,
        primaryTextColor: fg,
        secondaryColor: node,
        secondaryBorderColor: fg,
        secondaryTextColor: fg,
        tertiaryColor: node,
        tertiaryBorderColor: fg,
        tertiaryTextColor: fg,
        // Subgraph clusters
        clusterBkg: bg,
        clusterBorder: marker,
        // Edges
        lineColor: subtle,
        // Edge labels get the site's red accent so they pop like links
        edgeLabelBackground: bg,
        labelColor: accent
      }
    });

    // mermaid renders into a throwaway node; we own the markup it returns.
    const { svg } = await mermaid.render(id, chart);
    container.innerHTML = svg;
  }

  $effect(() => {
    // Re-render whenever the theme flips or the chart source changes.
    void [mode.current, chart];
    renderChart();
  });
</script>

<figure class="mermaid">
  <div class="mermaid__diagram" bind:this={container}></div>
  {#if caption}
    <figcaption class="mermaid__caption">{caption}</figcaption>
  {/if}
</figure>

<style>
  .mermaid {
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
  }

  .mermaid__diagram {
    display: flex;
    justify-content: center;
    padding: 2rem;
    border: 1px solid var(--visBg);
    border-radius: 4px;
    /* Dot-grid background, like a typical node-editor canvas */
    background-color: var(--codeBg);
    background-image: radial-gradient(var(--visBg) 1px, transparent 1px);
    background-size: 20px 20px;
    background-position: -10px -10px;
  }

  .mermaid__diagram :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .mermaid__caption {
    font-size: 0.875rem;
    font-family: var(--codeFont);
    text-align: center;
    color: var(--subtle);
    margin-top: 0.5rem;
  }
</style>
