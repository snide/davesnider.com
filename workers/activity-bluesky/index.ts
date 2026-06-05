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

interface BlueskyEmbed {
  $type?: string;
  images?: Array<{ image: { ref: { $link: string } } }>;
  video?: { ref?: { $link: string }; mimeType?: string };
  playlist?: string;
  thumbnail?: string;
  aspectRatio?: { width: number; height: number };
  media?: BlueskyEmbed;
}

interface BlueskyHydratedEmbed {
  $type?: string;
  images?: Array<{ fullsize?: string; thumb?: string; alt?: string }>;
  playlist?: string;
  thumbnail?: string;
  aspectRatio?: { width: number; height: number };
  media?: BlueskyHydratedEmbed;
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
    embed?: BlueskyEmbed;
    facets?: BlueskyFacet[];
  };
  // Hydrated embed view (contains resolved URLs like playlist)
  embed?: BlueskyHydratedEmbed;
  indexedAt: string;
}

interface BlueskyFeedResponse {
  feed: Array<{
    post: BlueskyPost;
  }>;
  cursor?: string;
}

interface BlueskyThreadNode {
  post: BlueskyPost;
  parent?: BlueskyThreadNode;
  replies?: BlueskyThreadNode[];
}

interface BlueskyThreadResponse {
  thread: BlueskyThreadNode;
}

interface ThreadPost {
  uri: string;
  authorDid: string;
  postText: string;
  createdAt: string;
  images?: string[];
  video?: string; // HLS playlist URL
  videoThumbnail?: string; // Thumbnail for video preview
  facets?: BlueskyFacet[];
  replyParentUri?: string;
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

function collectAuthorAndPost(node: BlueskyThreadNode, authors: Map<string, Author>): ThreadPost {
  const post = node.post;

  // Collect author info
  authors.set(post.author.did, {
    did: post.author.did,
    handle: post.author.handle,
    displayName: post.author.displayName,
    avatar: post.author.avatar
  });

  // Extract images and video from both raw embed and hydrated embed view
  const rawEmbed = post.record.embed;
  const hydratedEmbed = post.embed;

  // Extract images from raw embed (has blob refs)
  const images =
    rawEmbed?.images?.map(
      (img) => `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.author.did}/${img.image.ref.$link}@jpeg`
    ) ||
    rawEmbed?.media?.images?.map(
      (img) => `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.author.did}/${img.image.ref.$link}@jpeg`
    );

  // Extract video and thumbnail from embed structure
  let video: string | undefined;
  let videoThumbnail: string | undefined;

  // Helper to extract video info from any embed-like object
  const extractVideoInfo = (embed: Record<string, unknown> | undefined): { playlist?: string; thumbnail?: string } => {
    if (!embed) return {};

    // Direct video embed (app.bsky.embed.video#view)
    if (typeof embed.playlist === 'string') {
      return {
        playlist: embed.playlist,
        thumbnail: typeof embed.thumbnail === 'string' ? embed.thumbnail : undefined
      };
    }

    // Nested in media field (app.bsky.embed.recordWithMedia#view)
    if (embed.media && typeof embed.media === 'object') {
      const media = embed.media as Record<string, unknown>;
      if (typeof media.playlist === 'string') {
        return {
          playlist: media.playlist,
          thumbnail: typeof media.thumbnail === 'string' ? media.thumbnail : undefined
        };
      }
    }

    return {};
  };

  // Try hydrated embed first (has resolved URLs)
  const videoInfo = extractVideoInfo(hydratedEmbed as Record<string, unknown>);
  video = videoInfo.playlist;
  videoThumbnail = videoInfo.thumbnail;

  // Fall back to raw embed if needed
  if (!video) {
    const rawVideoInfo = extractVideoInfo(rawEmbed as Record<string, unknown>);
    video = rawVideoInfo.playlist;
    videoThumbnail = rawVideoInfo.thumbnail;
  }

  // Last resort: construct from video blob ref
  if (!video) {
    const videoRef =
      (rawEmbed?.video as { ref?: { $link?: string } })?.ref?.$link ||
      ((rawEmbed?.media as BlueskyEmbed)?.video as { ref?: { $link?: string } })?.ref?.$link;
    if (videoRef) {
      video = `https://video.bsky.app/watch/${post.author.did}/${videoRef}/playlist.m3u8`;
      videoThumbnail = `https://video.bsky.app/watch/${post.author.did}/${videoRef}/thumbnail.jpg`;
    }
  }

  return {
    uri: post.uri,
    authorDid: post.author.did,
    postText: post.record.text,
    createdAt: post.record.createdAt,
    images,
    video,
    videoThumbnail,
    facets: post.record.facets,
    replyParentUri: post.record.reply?.parent.uri
  };
}

// Sort posts by tree structure - depth-first traversal respecting parent-child relationships
function sortPostsByTree(posts: ThreadPost[]): ThreadPost[] {
  if (posts.length <= 1) return posts;

  // Build lookup maps
  const postByUri = new Map<string, ThreadPost>();
  const childrenByParentUri = new Map<string, ThreadPost[]>();

  for (const post of posts) {
    postByUri.set(post.uri, post);

    const parentUri = post.replyParentUri;
    if (parentUri) {
      const siblings = childrenByParentUri.get(parentUri) || [];
      siblings.push(post);
      childrenByParentUri.set(parentUri, siblings);
    }
  }

  // Sort siblings: replies from others come before self-replies, then by timestamp
  for (const [parentUri, siblings] of childrenByParentUri.entries()) {
    const parent = postByUri.get(parentUri);
    const parentAuthor = parent?.authorDid;

    siblings.sort((a, b) => {
      // If one is a self-reply and the other isn't, put the non-self-reply first
      const aIsSelfReply = parentAuthor && a.authorDid === parentAuthor;
      const bIsSelfReply = parentAuthor && b.authorDid === parentAuthor;

      if (aIsSelfReply && !bIsSelfReply) return 1; // a comes after b
      if (!aIsSelfReply && bIsSelfReply) return -1; // a comes before b

      // Otherwise sort by timestamp
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  // Find root posts (no parent, or parent not in our set)
  const roots = posts.filter((p) => !p.replyParentUri || !postByUri.has(p.replyParentUri));
  roots.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Depth-first traversal
  const result: ThreadPost[] = [];
  const visited = new Set<string>();

  function visit(post: ThreadPost) {
    if (visited.has(post.uri)) return;
    visited.add(post.uri);
    result.push(post);

    // Visit children in timestamp order
    const children = childrenByParentUri.get(post.uri) || [];
    for (const child of children) {
      visit(child);
    }
  }

  for (const root of roots) {
    visit(root);
  }

  // Add any orphaned posts we might have missed
  for (const post of posts) {
    if (!visited.has(post.uri)) {
      result.push(post);
    }
  }

  return result;
}

async function fetchThread(uri: string, userDid: string, authors: Map<string, Author>): Promise<ThreadPost[]> {
  // Use depth=3 to capture replies to our replies (and their replies)
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=3&parentHeight=10`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch thread for ${uri}: ${response.status}`);
      return [];
    }

    const data: BlueskyThreadResponse = await response.json();
    const posts: ThreadPost[] = [];
    const seenUris = new Set<string>();

    // First, find the root author (the person who started the thread)
    let rootAuthorDid: string | undefined;
    let current: BlueskyThreadNode | undefined = data.thread;
    while (current?.parent) {
      current = current.parent;
    }
    if (current) {
      rootAuthorDid = current.post.author.did;
    }

    // Walk up the parent chain to collect thread posts
    current = data.thread;
    while (current) {
      if (!seenUris.has(current.post.uri)) {
        posts.push(collectAuthorAndPost(current, authors));
        seenUris.add(current.post.uri);
      }
      current = current.parent;
    }

    // Reverse so oldest post is first (thread order)
    posts.reverse();

    // Now look for replies from the root author to any of the user's posts
    // This captures the "they reply to my reply" case
    if (rootAuthorDid && rootAuthorDid !== userDid) {
      const repliesToCapture = findRepliesFromAuthor(data.thread, rootAuthorDid, userDid, authors, seenUris);
      posts.push(...repliesToCapture);
    }

    // Sort posts by tree structure (depth-first), respecting parent-child relationships
    return sortPostsByTree(posts);
  } catch (error) {
    console.error(`Error fetching thread for ${uri}:`, error);
    return [];
  }
}

// Find replies from targetAuthor to posts by userDid, recursively searching the tree
function findRepliesFromAuthor(
  node: BlueskyThreadNode,
  targetAuthorDid: string,
  userDid: string,
  authors: Map<string, Author>,
  seenUris: Set<string>
): ThreadPost[] {
  const results: ThreadPost[] = [];

  if (!node.replies) {
    return results;
  }

  for (const reply of node.replies) {
    const replyAuthorDid = reply.post.author.did;
    const parentAuthorDid = node.post.author.did;

    // If this reply is from the target author (root/parent author)
    // and the parent post was by the user, capture it
    if (replyAuthorDid === targetAuthorDid && parentAuthorDid === userDid) {
      if (!seenUris.has(reply.post.uri)) {
        results.push(collectAuthorAndPost(reply, authors));
        seenUris.add(reply.post.uri);
      }
    }

    // Recursively check deeper replies
    results.push(...findRepliesFromAuthor(reply, targetAuthorDid, userDid, authors, seenUris));
  }

  return results;
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

async function processPost(post: BlueskyPost, userDid: string, authors: Map<string, Author>): Promise<ProcessedPost> {
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

  // Extract images from raw embed
  const rawEmbed = post.record.embed;
  const images =
    rawEmbed?.images?.map(
      (img) => `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.author.did}/${img.image.ref.$link}@jpeg`
    ) ||
    (rawEmbed?.media as BlueskyEmbed)?.images?.map(
      (img) => `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.author.did}/${img.image.ref.$link}@jpeg`
    );

  // Extract video from hydrated embed (has playlist URL)
  const hydratedEmbed = post.embed;
  let video: string | undefined;
  let videoThumbnail: string | undefined;
  if (hydratedEmbed) {
    // Direct video embed
    const directEmbed = hydratedEmbed as { playlist?: string; thumbnail?: string };
    if (directEmbed.playlist) {
      video = directEmbed.playlist;
      videoThumbnail = directEmbed.thumbnail;
    }
    // Video in recordWithMedia
    else if (hydratedEmbed.media) {
      const media = hydratedEmbed.media as { playlist?: string; thumbnail?: string };
      if (media.playlist) {
        video = media.playlist;
        videoThumbnail = media.thumbnail;
      }
    }
  }

  // Fetch thread posts if this is a reply
  let threadPosts: ThreadPost[] | undefined;
  if (isReply) {
    threadPosts = await fetchThread(post.uri, userDid, authors);
  } else if (video || images) {
    // For non-reply posts with media, create a self-referencing threadPost
    // so the media is captured and displayed
    threadPosts = [
      {
        uri: post.uri,
        authorDid: post.author.did,
        postText: post.record.text,
        createdAt: post.record.createdAt,
        images,
        video,
        videoThumbnail,
        facets: post.record.facets
      }
    ];
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
    images,
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

  // Get the user's DID from the first post (all posts are from the same user)
  const userDid = posts[0]?.author.did;
  if (!userDid) {
    return { items: [], authors: [] };
  }

  const items = await Promise.all(posts.map((post) => processPost(post, userDid, authors)));

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
