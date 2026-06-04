import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface BlueskyPost {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  record: {
    text: string;
    createdAt: string;
    reply?: {
      parent: { uri: string };
      root: { uri: string };
    };
    facets?: Array<{
      index: { byteStart: number; byteEnd: number };
      features: Array<{
        $type: string;
        did?: string;
        uri?: string;
        tag?: string;
      }>;
    }>;
  };
  embed?: {
    images?: Array<{
      thumb: string;
      fullsize: string;
      alt: string;
    }>;
  };
}

interface ThreadNode {
  post: BlueskyPost;
  parent?: ThreadNode;
  replies?: ThreadNode[];
}

function parsePost(post: BlueskyPost) {
  const rkey = post.uri.split('/').pop();
  return {
    uri: post.uri,
    url: `https://bsky.app/profile/${post.author.handle}/post/${rkey}`,
    author: {
      did: post.author.did,
      handle: post.author.handle,
      displayName: post.author.displayName,
      avatar: post.author.avatar
    },
    text: post.record.text,
    facets: post.record.facets,
    createdAt: post.record.createdAt,
    images: post.embed?.images?.map((img) => img.thumb)
  };
}

// Collect thread posts from root to current, then replies to current
function collectThread(thread: ThreadNode, targetUri: string, authorDid: string): BlueskyPost[] {
  const posts: BlueskyPost[] = [];

  // Walk up to find root
  function walkUp(node: ThreadNode): BlueskyPost[] {
    const chain: BlueskyPost[] = [];
    if (node.parent?.post) {
      chain.push(...walkUp(node.parent));
    }
    chain.push(node.post);
    return chain;
  }

  // Get posts from root to current
  posts.push(...walkUp(thread));

  // Collect direct replies to the current post (any author)
  // This shows the conversation continuing from the target post
  function collectReplies(node: ThreadNode, depth: number = 0) {
    if (depth > 5 || !node.replies) return; // Limit depth to avoid huge threads
    for (const reply of node.replies) {
      posts.push(reply.post);
      // Only continue collecting if it's a self-reply (author's own thread continuation)
      if (reply.post.author.did === authorDid) {
        collectReplies(reply, depth + 1);
      }
    }
  }

  collectReplies(thread, 0);

  return posts;
}

export const GET: RequestHandler = async ({ url }) => {
  const uri = url.searchParams.get('uri');
  const mode = url.searchParams.get('mode') || 'single'; // 'single' or 'thread'

  if (!uri) {
    return json({ error: 'Missing uri parameter' }, { status: 400 });
  }

  try {
    // Fetch post thread with depth for replies
    const depth = mode === 'thread' ? 10 : 0;
    const parentHeight = mode === 'thread' ? 10 : 0;

    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=${depth}&parentHeight=${parentHeight}`
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`Bluesky API error: ${response.status} - ${text}`);
      return json({ error: 'Failed to fetch post' }, { status: response.status });
    }

    const data = await response.json();
    const thread = data.thread as ThreadNode;

    if (!thread?.post) {
      return json({ error: 'Post not found' }, { status: 404 });
    }

    if (mode === 'thread') {
      // Return full thread for self-threads
      const authorDid = thread.post.author.did;
      const posts = collectThread(thread, uri, authorDid);

      return json({
        thread: posts.map(parsePost),
        currentUri: uri
      });
    }

    // Single post mode
    return json(parsePost(thread.post));
  } catch (err) {
    console.error('Error fetching Bluesky post:', err);
    return json(
      { error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
