import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { defineConfig } from 'vitest/config';
import mdsvexConfig from './mdsvex.config.js';

export default defineConfig({
  plugins: [
    sveltekit({
      extensions: ['.svelte', '.svx', '.mdx'],
      preprocess: [vitePreprocess(), mdsvex(mdsvexConfig)],
      adapter: adapter(),
      csrf: {
        // '*' turns Kit's own origin check off (the Kit 3 equivalent of the old
        // checkOrigin: false). hooks.server.ts does its own check so that the
        // Plex webhook and the flight recorder's multipart uploads, which send
        // no Origin header, still get through.
        trustedOrigins: ['*']
      }
    })
  ],
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
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});
