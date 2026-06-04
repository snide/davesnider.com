interface Env {
  HN_USERNAME: string;
  ACTIVITY_INGEST_TOKEN: string;
  INGEST_URL: string;
}

interface HNAlgoliaResponse {
  hits: HNItem[];
  nbHits: number;
  page: number;
  nbPages: number;
}

interface HNItem {
  objectID: string;
  author: string;
  created_at: string;
  created_at_i: number;
  title?: string;
  story_title?: string;
  comment_text?: string;
  story_text?: string;
  url?: string;
  story_url?: string;
  points?: number;
  _tags: string[];
}

async function fetchUserActivity(username: string): Promise<HNItem[]> {
  const response = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=author_${username}&hitsPerPage=50`);

  if (!response.ok) {
    throw new Error(`Failed to fetch HN activity: ${response.status}`);
  }

  const data: HNAlgoliaResponse = await response.json();
  return data.hits;
}

function getItemType(item: HNItem): 'story' | 'comment' | 'ask' | 'show' {
  if (item._tags.includes('ask_hn')) return 'ask';
  if (item._tags.includes('show_hn')) return 'show';
  if (item._tags.includes('story')) return 'story';
  return 'comment';
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Hacker News activity worker triggered');

    try {
      const activity = await fetchUserActivity(env.HN_USERNAME);

      const items = activity.map((item) => {
        const itemType = getItemType(item);
        const isComment = itemType === 'comment';

        let title: string;
        let body: string | undefined;
        let url: string;

        if (isComment) {
          const commentText = item.comment_text ? stripHtml(item.comment_text) : '';
          title = truncateText(`Comment on: ${item.story_title || 'Unknown'}`, 100);
          body = commentText;
          url = `https://news.ycombinator.com/item?id=${item.objectID}`;
        } else {
          title = truncateText(item.title || item.story_title || 'Untitled', 100);
          body = item.story_text ? stripHtml(item.story_text) : undefined;
          url = item.url || `https://news.ycombinator.com/item?id=${item.objectID}`;
        }

        return {
          externalId: item.objectID,
          timestamp: item.created_at_i,
          title,
          url,
          itemType,
          body,
          hnScore: item.points
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
      console.log('HN ingest result:', result);
    } catch (error) {
      console.error('HN worker error:', error);
      throw error;
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    // Allow manual trigger via HTTP for testing
    if (request.method === 'POST') {
      try {
        const activity = await fetchUserActivity(env.HN_USERNAME);

        const items = activity.map((item) => {
          const itemType = getItemType(item);
          const isComment = itemType === 'comment';

          let title: string;
          let body: string | undefined;
          let url: string;

          if (isComment) {
            const commentText = item.comment_text ? stripHtml(item.comment_text) : '';
            title = truncateText(`Comment on: ${item.story_title || 'Unknown'}`, 100);
            body = commentText;
            url = `https://news.ycombinator.com/item?id=${item.objectID}`;
          } else {
            title = truncateText(item.title || item.story_title || 'Untitled', 100);
            body = item.story_text ? stripHtml(item.story_text) : undefined;
            url = item.url || `https://news.ycombinator.com/item?id=${item.objectID}`;
          }

          return {
            externalId: item.objectID,
            timestamp: item.created_at_i,
            title,
            url,
            itemType,
            body,
            hnScore: item.points
          };
        });

        const response = await fetch(env.INGEST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
          },
          body: JSON.stringify({ items, deletedIds: [] })
        });

        const result = await response.json();
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
