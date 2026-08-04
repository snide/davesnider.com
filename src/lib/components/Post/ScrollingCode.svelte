<script lang="ts">
  type Props = {
    code: string;
  };

  let { code }: Props = $props();
</script>

<div class="scrollingCode"><pre class="scrollingCode__pre">{code}</pre></div>

<style>
  .scrollingCode {
    position: relative;
  }

  /* When stacked there's no sibling to inherit a height from */
  @media (max-width: 768px) {
    .scrollingCode {
      min-height: 20rem;
    }
  }

  /* Absolutely positioned so the surrounding grid cell, not the code,
     determines the height; overflow scrolls vertically instead */
  .scrollingCode__pre {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    margin: 0;
    padding: 1rem;
    background-color: var(--fg);
    border: solid 1px var(--shiki-token-border);
    font-family: var(--codeFont);
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--bg);
    white-space: pre-wrap;
  }
</style>
