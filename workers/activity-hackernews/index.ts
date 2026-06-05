interface Env {
  HN_USERNAME: string;
  ACTIVITY_INGEST_TOKEN: string;
  INGEST_URL: string;
}

interface HNUser {
  id: string;
  created: number;
  karma: number;
  submitted?: number[];
}

interface HNItem {
  id: number;
  type: 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
  by?: string;
  time: number;
  text?: string;
  url?: string;
  title?: string;
  score?: number;
  descendants?: number;
  parent?: number;
  kids?: number[];
  deleted?: boolean;
  dead?: boolean;
}

const HN_API = 'https://hacker-news.firebaseio.com/v0';

async function fetchUser(username: string): Promise<HNUser | null> {
  const response = await fetch(`${HN_API}/user/${username}.json`);
  if (!response.ok) return null;
  return response.json();
}

async function fetchItem(id: number): Promise<HNItem | null> {
  const response = await fetch(`${HN_API}/item/${id}.json`);
  if (!response.ok) return null;
  return response.json();
}

// Walk up parent chain to find root story
async function findRootStory(item: HNItem): Promise<{ rootId: number; parentId: number | null }> {
  if (item.type === 'story') {
    return { rootId: item.id, parentId: null };
  }

  const parentId = item.parent || null;
  let currentId = item.parent;
  let rootId = item.id;

  // Walk up the parent chain (limit to 50 to prevent infinite loops)
  for (let i = 0; i < 50 && currentId; i++) {
    const parent = await fetchItem(currentId);
    if (!parent) break;

    if (parent.type === 'story') {
      rootId = parent.id;
      break;
    }
    currentId = parent.parent;
  }

  return { rootId, parentId };
}

function getItemType(item: HNItem): 'story' | 'comment' | 'ask' | 'show' {
  if (item.type === 'comment') return 'comment';
  if (item.title?.toLowerCase().startsWith('ask hn')) return 'ask';
  if (item.title?.toLowerCase().startsWith('show hn')) return 'show';
  return 'story';
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Convert HTML entities but keep HTML tags for rendering
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

// Strip HTML for title/summary only
function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, '')).trim();
}

// Normalize HTML content to ensure consistent paragraph wrapping
// HN API often returns first paragraph unwrapped, with <p> tags for subsequent paragraphs
function normalizeHtml(html: string): string {
  // If empty or only whitespace, return empty
  if (!html || !html.trim()) return '';

  // Check if content starts with a block-level tag
  const startsWithBlock = /^<(p|pre|blockquote|ul|ol|li|h[1-6])/i.test(html.trim());

  if (startsWithBlock) {
    // Content already properly formatted
    return html;
  }

  // Split by <p> tags to find the unwrapped first paragraph
  const parts = html.split(/<p>/i);

  if (parts.length === 1) {
    // No <p> tags at all, wrap entire content
    return `<p>${html}</p>`;
  }

  // First part is unwrapped, rest have <p> tags
  const firstPart = parts[0].trim();
  const rest = parts
    .slice(1)
    .map((p) => `<p>${p}`)
    .join('');

  if (firstPart) {
    return `<p>${firstPart}</p>${rest}`;
  }

  return rest;
}

async function processItems(env: Env): Promise<{ items: unknown[]; errors: string[] }> {
  console.log(`Fetching HN user: ${env.HN_USERNAME}`);
  const user = await fetchUser(env.HN_USERNAME);

  if (!user || !user.submitted) {
    throw new Error(`User ${env.HN_USERNAME} not found or has no submissions`);
  }

  // Only process recent items (last 50)
  const recentIds = user.submitted.slice(0, 50);
  console.log(`Processing ${recentIds.length} recent items`);

  const items: unknown[] = [];
  const errors: string[] = [];

  // Process items in batches to avoid overwhelming the API
  const batchSize = 10;
  for (let i = 0; i < recentIds.length; i += batchSize) {
    const batch = recentIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        try {
          const item = await fetchItem(id);
          if (!item || item.deleted || item.dead) return null;

          const itemType = getItemType(item);
          const isComment = itemType === 'comment';

          // Get root story for threading
          const { rootId, parentId } = await findRootStory(item);

          let title: string;
          let body: string | undefined;
          let url: string;

          if (isComment) {
            // For comments, try to get parent story title
            const rootStory = rootId !== item.id ? await fetchItem(rootId) : null;
            const storyTitle = rootStory?.title || 'a discussion';
            title = truncateText(`Comment on: ${storyTitle}`, 100);
            // Keep HTML in body for proper rendering, normalize paragraph wrapping
            body = item.text ? normalizeHtml(decodeHtmlEntities(item.text)) : undefined;
            url = `https://news.ycombinator.com/item?id=${item.id}`;
          } else {
            title = truncateText(item.title || 'Untitled', 100);
            // Keep HTML in body for Ask HN / Show HN text posts, normalize paragraph wrapping
            body = item.text ? normalizeHtml(decodeHtmlEntities(item.text)) : undefined;
            url = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
          }

          return {
            externalId: String(item.id),
            timestamp: item.time,
            title,
            url,
            itemType,
            body,
            hnScore: item.score || null,
            commentCount: item.descendants || null,
            parentId: parentId,
            rootId: rootId
          };
        } catch (err) {
          errors.push(`Failed to process item ${id}: ${err}`);
          return null;
        }
      })
    );

    items.push(...batchResults.filter(Boolean));

    // Small delay between batches to be nice to the API
    if (i + batchSize < recentIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { items, errors };
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Hacker News activity worker triggered');

    try {
      const { items, errors } = await processItems(env);

      if (errors.length > 0) {
        console.warn('Some items failed:', errors);
      }

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
      console.log('HN ingest result:', result);
    } catch (error) {
      console.error('HN worker error:', error);
      throw error;
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    // Allow manual trigger via HTTP for testing
    if (request.method === 'POST') {
      // Validate bearer token
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${env.ACTIVITY_INGEST_TOKEN}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const { items, errors } = await processItems(env);

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
          return new Response(JSON.stringify({ error: `Ingest failed: ${response.status}`, details: text }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await response.json();
        return new Response(JSON.stringify({ ...result, processingErrors: errors }), {
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
