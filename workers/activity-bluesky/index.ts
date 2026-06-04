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

interface BlueskyPost {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
  };
  record: {
    text: string;
    createdAt: string;
    reply?: {
      parent: { uri: string };
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

async function checkDeletedPosts(existingIds: string[], currentPosts: BlueskyPost[]): Promise<string[]> {
  const currentIds = new Set(currentPosts.map((p) => p.uri));
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;

  // Only check recent items (< 6 hours old) for deletion
  const deletedIds: string[] = [];
  for (const id of existingIds) {
    // If the post is not in current feed, it may be deleted
    // We only track deletions for recent posts to avoid false positives
    if (!currentIds.has(id)) {
      deletedIds.push(id);
    }
  }

  return deletedIds;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Bluesky activity worker triggered');

    try {
      const posts = await fetchRecentPosts(env.BLUESKY_HANDLE);

      const items = posts.map((post) => {
        const timestamp = Math.floor(new Date(post.record.createdAt).getTime() / 1000);
        const isReply = !!post.record.reply;

        return {
          externalId: post.uri,
          timestamp,
          title: truncateText(post.record.text, 100),
          url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
          postText: post.record.text,
          isReply,
          replyToUri: post.record.reply?.parent.uri,
          images: post.record.embed?.images?.map(
            (img) => `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.author.did}/${img.image.ref.$link}@jpeg`
          ),
          facets: post.record.facets
        };
      });

      // Send to ingest endpoint
      const response = await fetch(env.INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
        },
        body: JSON.stringify({ items, deletedIds: [] })
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

        const items = posts.map((post) => {
          const timestamp = Math.floor(new Date(post.record.createdAt).getTime() / 1000);
          const isReply = !!post.record.reply;

          return {
            externalId: post.uri,
            timestamp,
            title: truncateText(post.record.text, 100),
            url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
            postText: post.record.text,
            isReply,
            replyToUri: post.record.reply?.parent.uri,
            images: post.record.embed?.images?.map(
              (img) => `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.author.did}/${img.image.ref.$link}@jpeg`
            ),
            facets: post.record.facets
          };
        });

        console.log(`Sending ${items.length} items to ${env.INGEST_URL}`);

        const response = await fetch(env.INGEST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
          },
          body: JSON.stringify({ items, deletedIds: [] })
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
