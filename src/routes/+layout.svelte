<script lang="ts">
  // @ts-expect-error - font CSS import has no types
  import '@fontsource-variable/aleo';
  import '$lib/styles/vars.css';
  import '$lib/styles/globals.css';
  import { Nav, MobileNav } from '$components/Nav';
  import { ModeWatcher } from 'mode-watcher';
  import { onNavigate } from '$app/navigation';
  import type { Snippet } from 'svelte';

  type Props = {
    children: Snippet;
  };

  let { children }: Props = $props();
  let mobileNavOpen = $state(false);

  function toggleMobileNav() {
    mobileNavOpen = !mobileNavOpen;
    if (mobileNavOpen) {
      document.body.classList.add('noScroll');
    } else {
      document.body.classList.remove('noScroll');
    }
  }

  function closeMobileNav() {
    mobileNavOpen = false;
    document.body.classList.remove('noScroll');
  }

  onNavigate(() => {
    closeMobileNav();
  });
</script>

<ModeWatcher defaultMode="dark" />

<MobileNav isOpen={mobileNavOpen} onToggle={toggleMobileNav} />
<div class="base">
  <Nav isOpen={mobileNavOpen} />
  <main class="content">
    {@render children()}
  </main>
</div>
