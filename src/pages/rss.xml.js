import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function get() {
  const posts = await getCollection('posts');
  return rss({
    // `<title>` field in output xml
    title: 'Dave Snider',
    // `<description>` field in output xml
    description: 'A chaotic good designer that builds in the browser',
    // Pull in your project "site" from the endpoint context
    // https://docs.astro.build/en/reference/api-reference/#contextsite
    site: 'https://davesnider.com',
    // Array of `<item>`s in output xml
    // See "Generating items" section for examples using content collections and glob imports
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/posts/${post.slug}/`
    })),
    // (optional) inject custom xml
    customData: `<language>en-us</language>`
  });
}
