import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import mdsvexConfig from './mdsvex.config.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte', '.svx', '.mdx'],

  preprocess: [vitePreprocess(), mdsvex(mdsvexConfig)],

  kit: {
    adapter: adapter({
      runtime: 'nodejs22.x'
    }),
    alias: {
      $components: 'src/lib/components',
      $db: 'src/db',
      $lib: 'src/lib',
      $styles: 'src/lib/styles'
    }
  }
};

export default config;
