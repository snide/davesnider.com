export {};
let inViewItems: HTMLElement[] = [];
const items = document.querySelectorAll('.animate-item');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        inViewItems.push(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);
items.forEach((item) => {
  observer.observe(item);
});

setTimeout(() => {
  inViewItems.forEach((item, index) => {
    item.style.animationDelay = `${index * 100}ms`;
  });
}, 50);
