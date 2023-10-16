<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let threshold = 0;
  export let horizontal = false;
  export let elementScroll: HTMLElement = null;
  export let hasMore = true;

  const dispatch = createEventDispatcher();

  let isLoadMore = false;

  // This function checks whether the scrolling is happening on the window or a specific element
  const isWindowScrolling = () => !elementScroll;

  const getScrollOffset = () => {
    if (isWindowScrolling()) {
      return document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
    } else {
      return horizontal
        ? elementScroll.scrollWidth - elementScroll.clientWidth - elementScroll.scrollLeft
        : elementScroll.scrollHeight - elementScroll.clientHeight - elementScroll.scrollTop;
    }
  };

  const onScroll = () => {
    const offset = getScrollOffset();

    if (offset <= threshold) {
      if (!isLoadMore && hasMore) {
        dispatch('loadMore');
      }
      isLoadMore = true;
    } else {
      isLoadMore = false;
    }
  };

  onMount(() => {
    const target = isWindowScrolling() ? window : elementScroll;
    target.addEventListener('scroll', onScroll);

    return () => {
      target.removeEventListener('scroll', onScroll);
    };
  });
</script>

<div style="width:0px" />
