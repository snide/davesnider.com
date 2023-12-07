import { defineConfig } from 'astro/config';
import theme from './codeTheme.json';
import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel/serverless';
import robotsTxt from 'astro-robots-txt';
import rehypePrettyCode from 'rehype-pretty-code';

import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  site: 'https://davesnider.com',
  output: 'server',
  prefetch: true,
  adapter: vercel({
    imageService: true
  }),
  image: {
    domains: ['us-east-1.storage.xata.sh'],
    service: {
      entrypoint: 'astro/assets/services/noop'
    }
  },
  integrations: [
    robotsTxt(),
    mdx({
      syntaxHighlight: false,
      gfm: true,
      shikiConfig: {
        syntaxHighlight: false
      },
      rehypePlugins: [
        [
          rehypePrettyCode,
          {
            // https://rehype-pretty-code.netlify.app
            theme: 'css-variables'
          }
        ]
      ]
    }),
    svelte()
  ]
});
