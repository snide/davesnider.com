<script lang="ts">
  type Props = {
    isOpen: boolean;
    onToggle: () => void;
  };

  let { isOpen, onToggle }: Props = $props();
</script>

<div class="mobileNav">
  <h2><a href="/">Sníd</a></h2>
  <button class="mobileNav__toggle" onclick={onToggle} aria-expanded={isOpen} aria-label="Toggle menu">
    {isOpen ? '✕' : '≡'}
  </button>
</div>

<style>
  .mobileNav {
    background-color: var(--navBg);
    color: var(--fg);
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    padding: 1rem;
    z-index: 3;
    display: none;
    align-items: center;
    white-space: nowrap;
    gap: 0.5rem;
    height: 3.25rem;
    justify-content: space-between;
  }

  .mobileNav__toggle {
    background-color: transparent;
    border: none;
    color: var(--fg);
    cursor: pointer;
    font-size: 1.5rem;
    font-family: var(--displayFont);
    justify-self: flex-end;
  }

  .mobileNav h2 {
    font-family: var(--displayFont);
    font-weight: 700;
    font-size: 1.5rem;
  }

  @media (max-width: 768px) {
    .mobileNav {
      display: flex;
    }
  }
</style>
