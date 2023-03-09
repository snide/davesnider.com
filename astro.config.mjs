import { defineConfig } from 'astro/config';
import theme from './codeTheme.json';
import mdx from '@astrojs/mdx';
import image from '@astrojs/image';
import vercel from '@astrojs/vercel/serverless';
import robotsTxt from 'astro-robots-txt';

// https://astro.build/config
export default defineConfig({
  site: 'https://davesnider.com',
  output: 'server',
  adapter: vercel(),
  integrations: [
    robotsTxt({
      sitemapBaseFileName: 'sitemap-index.xml.gz'
    }),
    image({
      serviceEntryPoint: '@astrojs/image/sharp'
    }),
    mdx({
      syntaxHighlight: 'shiki',
      shikiConfig: { theme: theme },
      gfm: true
    })
  ]
});
