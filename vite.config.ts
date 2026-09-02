import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    // layerchart ships raw .svelte files; without this, Vite can externalize
    // it to Node during SSR, which crashes on the .svelte extension.
    noExternal: ['layerchart']
  },
  optimizeDeps: {
    // Only ever loaded via dynamic import() (ActivityItemFlight), so Vite
    // won't discover them up front; pre-bundle to avoid dev-cache misses.
    include: ['maplibre-gl', 'pmtiles', '@protomaps/basemaps']
  },
  resolve: {
    conditions: ['browser']
  },
  server: {
    allowedHosts: true
  }
});
