import { getCollection } from 'astro:content';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';

const posts = await getCollection('posts');
const urls = posts.map((post) => `https://davesnider.com/posts/${post.slug}`);
urls.push('https://davesnider.com', 'https://davesnider.com/about');

// adjust these links to be taking from somewhere in the database or anywhere else

export async function get() {
  // Create a stream to write to
  const stream = new SitemapStream({
    hostname: process.env.SITE_URL || 'http://localhost:3000'
  });

  const data = await streamToPromise(Readable.from(urls).pipe(stream));

  return {
    body: data.toString(),
    encoding: 'binary'
  };
}
