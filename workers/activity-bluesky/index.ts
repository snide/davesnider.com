interface Env {
  BLUESKY_HANDLE: string;
  ACTIVITY_INGEST_TOKEN: string;
  INGEST_URL: string;
}

interface BlueskyFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{
    $type: string;
    did?: string;
    uri?: string;
    tag?: string;
  }>;
}

interface BlueskyAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface BlueskyPost {
  uri: string;
  cid: string;
  author: BlueskyAuthor;
  record: {
    text: string;
    createdAt: string;
    reply?: {
      parent: { uri: string };
      root: { uri: string };
    };
    embed?: {
      images?: Array<{ image: { ref: { $link: string } } }>;
    };
    facets?: BlueskyFacet[];
  };
  indexedAt: string;
}

interface BlueskyFeedResponse {
  feed: Array<{
    post: BlueskyPost;
  }>;
  cursor?: string;
}

interface BlueskyThreadResponse {
  thread: {
    post: BlueskyPost;
    parent?: BlueskyThreadResponse['thread'];
  };
}

interface ThreadPost {
  uri: string;
  authorDid: string;
  postText: string;
  createdAt: string;
  images?: string[];
  facets?: BlueskyFacet[];
}

interface Author {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

async function fetchRecentPosts(handle: string): Promise<BlueskyPost[]> {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=50`;
  console.log(`Fetching Bluesky posts for: ${handle}`);

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    console.error(`Bluesky API error: ${response.status} - ${text}`);
    throw new Error(`Failed to fetch Bluesky posts: ${response.status} - ${text}`);
  }

  const data: BlueskyFeedResponse = await response.json();
  console.log(`Fetched ${data.feed.length} posts`);
  return data.feed.map((item) => item.post);
}

async function fetchThread(uri: string, authors: Map<string, Author>): Promise<ThreadPost[]> {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=10`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch thread for ${uri}: ${response.status}`);
      return [];
    }

    const data: BlueskyThreadResponse = await response.json();
    const posts: ThreadPost[] = [];

    // Walk up the parent chain to collect thread posts
    let current: BlueskyThreadResponse['thread'] | undefined = data.thread;
    while (current) {
      const post = current.post;

      // Collect author info
      authors.set(post.author.did, {
        did: post.author.did,
        handle: post.author.handle,
        displayName: post.author.displayName,
        avatar: post.author.avatar
      });

      posts.push({
        uri: post.uri,
        authorDid: post.author.did,
        postText: post.record.text,
        createdAt: post.record.createdAt,
        images: post.record.embed?.images?.map(
          (img) => `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.author.did}/${img.image.ref.$link}@jpeg`
        ),
        facets: post.record.facets
      });
      current = current.parent;
    }

    // Reverse so oldest post is first (thread order)
    return posts.reverse();
  } catch (error) {
    console.error(`Error fetching thread for ${uri}:`, error);
    return [];
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

interface ProcessedPost {
  externalId: string;
  timestamp: number;
  title: string;
  url: string;
  postText: string;
  isReply: boolean;
  replyToUri?: string;
  rootUri: string;
  images?: string[];
  facets?: BlueskyFacet[];
  authorDid: string;
  threadPosts?: ThreadPost[];
}

async function processPost(post: BlueskyPost, authors: Map<string, Author>): Promise<ProcessedPost> {
  const timestamp = Math.floor(new Date(post.record.createdAt).getTime() / 1000);
  const isReply = !!post.record.reply;
  const rootUri = post.record.reply?.root.uri ?? post.uri;

  // Collect main post author
  authors.set(post.author.did, {
    did: post.author.did,
    handle: post.author.handle,
    displayName: post.author.displayName,
    avatar: post.author.avatar
  });

  // Fetch thread posts if this is a reply
  let threadPosts: ThreadPost[] | undefined;
  if (isReply) {
    threadPosts = await fetchThread(post.uri, authors);
  }

  return {
    externalId: post.uri,
    timestamp,
    title: truncateText(post.record.text, 100),
    url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
    postText: post.record.text,
    isReply,
    replyToUri: post.record.reply?.parent.uri,
    rootUri,
    images: post.record.embed?.images?.map(
      (img) => `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.author.did}/${img.image.ref.$link}@jpeg`
    ),
    facets: post.record.facets,
    authorDid: post.author.did,
    threadPosts
  };
}

async function processPosts(posts: BlueskyPost[]): Promise<{
  items: ProcessedPost[];
  authors: Author[];
}> {
  const authors = new Map<string, Author>();
  const items = await Promise.all(posts.map((post) => processPost(post, authors)));

  return {
    items,
    authors: Array.from(authors.values())
  };
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Bluesky activity worker triggered');

    try {
      const posts = await fetchRecentPosts(env.BLUESKY_HANDLE);
      const { items, authors } = await processPosts(posts);

      console.log(`Processed ${items.length} posts with ${authors.length} unique authors`);

      // Send to ingest endpoint
      const response = await fetch(env.INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
        },
        body: JSON.stringify({ items, authors, deletedIds: [] })
      });

      if (!response.ok) {
        throw new Error(`Ingest failed: ${response.status} ${await response.text()}`);
      }

      const result = await response.json();
      console.log('Bluesky ingest result:', result);
    } catch (error) {
      console.error('Bluesky worker error:', error);
      throw error;
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    // Allow manual trigger via HTTP for testing
    if (request.method === 'POST') {
      try {
        const posts = await fetchRecentPosts(env.BLUESKY_HANDLE);
        const { items, authors } = await processPosts(posts);

        console.log(`Sending ${items.length} items with ${authors.length} authors to ${env.INGEST_URL}`);

        const response = await fetch(env.INGEST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
          },
          body: JSON.stringify({ items, authors, deletedIds: [] })
        });

        if (!response.ok) {
          const text = await response.text();
          console.error(`Ingest error: ${response.status} - ${text}`);
          return new Response(JSON.stringify({ error: `Ingest failed: ${response.status}`, details: text }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await response.json();
        console.log('Ingest result:', JSON.stringify(result));
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
};
