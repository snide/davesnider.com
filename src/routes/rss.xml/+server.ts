import { getPosts } from '$lib/utils/posts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const posts = await getPosts();

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<atom:link href="https://davesnider.com/rss.xml" rel="self" type="application/rss+xml" />
<title>Dave Snider</title>
<link>https://davesnider.com</link>
<description>A chaotic good web designer based out of Annapolis, MD that builds in the browser.</description>
${posts
  .map(
    (post) => `<item>
<title><![CDATA[${post.metadata.title}]]></title>
<link>https://davesnider.com/posts/${post.slug}</link>
<guid>https://davesnider.com/posts/${post.slug}</guid>
<description><![CDATA[${post.metadata.description}]]></description>
<pubDate>${new Date(post.metadata.pubDate).toUTCString()}</pubDate>
</item>`
  )
  .join('\n')}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'max-age=0, s-maxage=3600'
    }
  });
};
