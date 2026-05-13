/**
 * Svelte action for animating elements when they enter the viewport.
 * Usage: <div use:animate> or <div use:animate={{ delay: 100 }}>
 */

let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        const inViewEntries = entries.filter((entry) => entry.isIntersecting);

        if (inViewEntries.length > 0) {
          requestAnimationFrame(() => {
            inViewEntries.forEach((entry, index) => {
              const el = entry.target as HTMLElement;
              el.classList.add('in-view');
              // Stagger animations based on order they appear
              const baseDelay = parseInt(el.dataset.animateDelay || '0', 10);
              el.style.animationDelay = `${baseDelay + index * 75}ms`;
              observer?.unobserve(entry.target);
            });
          });
        }
      },
      { threshold: 0 }
    );
  }
  return observer;
}

export function animate(node: HTMLElement, options?: { delay?: number }) {
  node.classList.add('animate-item');
  if (options?.delay) {
    node.dataset.animateDelay = String(options.delay);
  }

  const obs = getObserver();
  obs.observe(node);

  return {
    destroy() {
      obs.unobserve(node);
    }
  };
}

/**
 * Svelte action for animating all direct children of an element when they enter the viewport.
 * Usage: <div use:animateChildren>
 */
export function animateChildren(node: HTMLElement) {
  const obs = getObserver();
  const children = Array.from(node.children) as HTMLElement[];

  children.forEach((child, index) => {
    child.classList.add('animate-item');
    child.dataset.animateDelay = String(index * 50);
    obs.observe(child);
  });

  return {
    destroy() {
      children.forEach((child) => {
        obs.unobserve(child);
      });
    }
  };
}
