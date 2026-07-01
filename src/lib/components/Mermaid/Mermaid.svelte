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
  let viewport = $state<HTMLDivElement>();

  // Pan + zoom are a single `translate() scale()` transform on the diagram
  // (transform-origin 0 0). Keeping both in one transform means zoom can pivot
  // around any point — the viewport centre for the buttons, the cursor for the
  // wheel — instead of lurching toward the top-left corner.
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.25;
  let zoom = $state(1);
  let tx = $state(0);
  let ty = $state(0);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));

  // Keep the diagram sensibly placed: centre it in whichever axis it's smaller
  // than the viewport, otherwise clamp the pan so you can't drag it fully out.
  function clampPan(nextX: number, nextY: number, scale: number) {
    if (!viewport || !container) return { x: nextX, y: nextY };
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const cw = container.offsetWidth * scale;
    const ch = container.offsetHeight * scale;
    return {
      x: cw <= vw ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, nextX)),
      y: ch <= vh ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, nextY))
    };
  }

  // Zoom about a viewport-space point (px, py), keeping the content under that
  // point fixed. Defaults to the viewport centre.
  function setZoom(next: number, px?: number, py?: number) {
    const scale = clampZoom(next);
    if (!viewport) {
      zoom = scale;
      return;
    }
    const anchorX = px ?? viewport.clientWidth / 2;
    const anchorY = py ?? viewport.clientHeight / 2;
    // Content coord currently sitting under the anchor, then re-place it there.
    const contentX = (anchorX - tx) / zoom;
    const contentY = (anchorY - ty) / zoom;
    const clamped = clampPan(anchorX - contentX * scale, anchorY - contentY * scale, scale);
    zoom = scale;
    tx = clamped.x;
    ty = clamped.y;
  }

  const zoomIn = () => setZoom(zoom + ZOOM_STEP);
  const zoomOut = () => setZoom(zoom - ZOOM_STEP);
  const resetZoom = () => {
    zoom = 1;
    centerView();
  };

  // Centre the diagram (or clamp it into view) at the current zoom.
  function centerView() {
    if (!viewport || !container) return;
    const clamped = clampPan(
      (viewport.clientWidth - container.offsetWidth * zoom) / 2,
      (viewport.clientHeight - container.offsetHeight * zoom) / 2,
      zoom
    );
    tx = clamped.x;
    ty = clamped.y;
  }

  function handleWheel(event: WheelEvent) {
    // Only hijack the wheel for zoom when a modifier is held, so normal page
    // and viewport scrolling still works.
    if ((!event.ctrlKey && !event.metaKey) || !viewport) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    setZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event.clientX - rect.left, event.clientY - rect.top);
  }

  // Drag-to-pan: track the pointer and translate movement into the transform
  // offset. Pointer Events cover mouse and touch with one code path.
  let isPanning = $state(false);
  let panStart = { x: 0, y: 0, tx: 0, ty: 0 };

  function handlePointerDown(event: PointerEvent) {
    // Let the zoom buttons handle their own clicks.
    if (!viewport || (event.target as HTMLElement).closest('.mermaid__controls')) return;
    isPanning = true;
    panStart = { x: event.clientX, y: event.clientY, tx, ty };
    viewport.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isPanning) return;
    const clamped = clampPan(
      panStart.tx + (event.clientX - panStart.x),
      panStart.ty + (event.clientY - panStart.y),
      zoom
    );
    tx = clamped.x;
    ty = clamped.y;
  }

  function handlePointerUp(event: PointerEvent) {
    if (!isPanning || !viewport) return;
    isPanning = false;
    viewport.releasePointerCapture(event.pointerId);
  }

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
        // Render at natural size (not shrunk to fit) so the viewport can
        // scroll/zoom it — keeps text legible on mobile.
        useMaxWidth: false,
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
    // Centre the freshly-measured diagram once layout has settled.
    requestAnimationFrame(centerView);
  }

  $effect(() => {
    // Re-render whenever the theme flips or the chart source changes.
    void [mode.current, chart];
    renderChart();
  });

  $effect(() => {
    // Re-centre / re-clamp when the viewport is resized.
    if (typeof window === 'undefined') return;
    const onResize = () => centerView();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
</script>

<figure class="mermaid">
  <div
    class="mermaid__viewport"
    class:mermaid__viewport--panning={isPanning}
    bind:this={viewport}
    role="application"
    aria-label={caption ?? 'Architecture diagram, drag to pan'}
    style="background-position: {tx - 10}px {ty - 10}px; background-size: {20 * zoom}px {20 * zoom}px;"
    onwheel={handleWheel}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
  >
    <div
      class="mermaid__diagram"
      class:mermaid__diagram--static={isPanning}
      bind:this={container}
      style="transform: translate({tx}px, {ty}px) scale({zoom});"
    ></div>
  </div>
  <!-- Controls live outside the viewport so they stay put while panning. -->
  <div class="mermaid__controls">
    <button class="mermaid__button" onclick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">&minus;</button>
    <button class="mermaid__button mermaid__button--reset" onclick={resetZoom} aria-label="Reset zoom">
      {Math.round(zoom * 100)}%
    </button>
    <button class="mermaid__button" onclick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">&plus;</button>
  </div>
  {#if caption}
    <figcaption class="mermaid__caption">{caption}</figcaption>
  {/if}
</figure>

<style>
  .mermaid {
    position: relative;
    width: 100%;
    max-width: 1200px;
    margin: 6rem auto !important;
  }

  .mermaid__viewport {
    position: relative;
    overflow: hidden;
    max-height: 80vh;
    border: 1px solid var(--visBg);
    border-radius: 4px;
    cursor: grab;
    /* Drag-to-pan owns the gestures, so disable native touch scroll/zoom and
       avoid selecting the diagram's text mid-drag. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    /* Dot-grid background, like a typical node-editor canvas. Position and size
       are driven inline so the grid tracks the diagram as it pans and zooms. */
    background-color: var(--codeBg);
    background-image: radial-gradient(var(--visBg) 1px, transparent 1px);
    /* Match the diagram's transform easing so the grid glides with it on zoom. */
    transition:
      background-position 0.1s ease-out,
      background-size 0.1s ease-out;
  }

  .mermaid__viewport--panning {
    cursor: grabbing;
    /* No easing mid-drag — the grid should track the pointer 1:1. */
    transition: none;
  }

  .mermaid__diagram {
    padding: 2rem;
    transform-origin: 0 0;
    transition: transform 0.1s ease-out;
    width: fit-content;
    box-sizing: border-box;
  }

  /* No easing mid-drag so the diagram tracks the pointer 1:1. */
  .mermaid__diagram--static {
    transition: none;
  }

  .mermaid__diagram :global(svg) {
    max-width: none;
    height: auto;
  }

  .mermaid__controls {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.25rem;
  }

  .mermaid__button {
    font-family: var(--codeFont);
    font-size: 0.875rem;
    line-height: 1;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 0.4rem;
    color: var(--fg);
    background-color: var(--navBg);
    border: 1px solid var(--visBg);
    border-radius: 4px;
    cursor: pointer;
  }

  .mermaid__button--reset {
    min-width: 3rem;
  }

  .mermaid__button:hover:not(:disabled) {
    background-color: var(--fileHoverBg);
  }

  .mermaid__button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .mermaid__caption {
    font-size: 0.875rem;
    font-family: var(--codeFont);
    text-align: center;
    color: var(--subtle);
    margin-top: 0.5rem;
  }
</style>
