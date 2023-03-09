import { getCollection } from 'astro:content';

import { simpleSitemapAndIndex } from 'sitemap';

const posts = await getCollection('posts');
const urls = posts.map((post) => `https://davesnider.com/posts/${post.slug}`);
urls.push('https://davesnider.com', 'https://davesnider.com/about');

simpleSitemapAndIndex({
  hostname: 'https://davesnider.com',
  destinationDir: './src/pages',
  // or (only works with node 10.17 and up)
  sourceData: urls
});
