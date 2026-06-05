interface Env {
  REDDIT_USERNAME: string;
  REDDIT_CLIENT_ID: string;
  REDDIT_CLIENT_SECRET: string;
  ACTIVITY_INGEST_TOKEN: string;
  INGEST_URL: string;
}

interface RedditListing {
  data: {
    children: Array<{
      kind: string;
      data: RedditSubmission | RedditComment;
    }>;
    after?: string;
  };
}

interface RedditSubmission {
  id: string;
  name: string;
  title: string;
  selftext: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
  score: number;
  edited: false | number; // false if never edited, Unix timestamp if edited
}

interface RedditComment {
  id: string;
  name: string;
  body: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
  score: number;
  link_title: string;
  edited: false | number; // false if never edited, Unix timestamp if edited
}

async function getAccessToken(env: Env): Promise<string> {
  const auth = btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`);

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ActivityFeedWorker/1.0'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error(`Failed to get Reddit access token: ${response.status}`);
  }

  const data: { access_token: string } = await response.json();
  return data.access_token;
}

async function fetchUserContent(
  username: string,
  accessToken: string,
  type: 'submitted' | 'comments'
): Promise<Array<{ kind: string; data: RedditSubmission | RedditComment }>> {
  const response = await fetch(`https://oauth.reddit.com/user/${username}/${type}?limit=50&sort=new`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'ActivityFeedWorker/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Reddit ${type}: ${response.status}`);
  }

  const data: RedditListing = await response.json();
  return data.data.children;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Reddit activity worker triggered');

    try {
      const accessToken = await getAccessToken(env);

      const [submissions, comments] = await Promise.all([
        fetchUserContent(env.REDDIT_USERNAME, accessToken, 'submitted'),
        fetchUserContent(env.REDDIT_USERNAME, accessToken, 'comments')
      ]);

      const items = [
        ...submissions.map((item) => {
          const post = item.data as RedditSubmission;
          return {
            externalId: post.name,
            timestamp: Math.floor(post.created_utc),
            title: truncateText(post.title, 100),
            url: `https://reddit.com${post.permalink}`,
            subreddit: post.subreddit,
            itemType: 'submission' as const,
            body: post.selftext || undefined,
            score: post.score,
            editedAt: post.edited === false ? null : Math.floor(post.edited)
          };
        }),
        ...comments.map((item) => {
          const comment = item.data as RedditComment;
          return {
            externalId: comment.name,
            timestamp: Math.floor(comment.created_utc),
            title: truncateText(`Comment on: ${comment.link_title}`, 100),
            url: `https://reddit.com${comment.permalink}`,
            subreddit: comment.subreddit,
            itemType: 'comment' as const,
            body: comment.body,
            score: comment.score,
            editedAt: comment.edited === false ? null : Math.floor(comment.edited)
          };
        })
      ];

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
      console.log('Reddit ingest result:', result);
    } catch (error) {
      console.error('Reddit worker error:', error);
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
        const accessToken = await getAccessToken(env);

        const [submissions, comments] = await Promise.all([
          fetchUserContent(env.REDDIT_USERNAME, accessToken, 'submitted'),
          fetchUserContent(env.REDDIT_USERNAME, accessToken, 'comments')
        ]);

        const items = [
          ...submissions.map((item) => {
            const post = item.data as RedditSubmission;
            return {
              externalId: post.name,
              timestamp: Math.floor(post.created_utc),
              title: truncateText(post.title, 100),
              url: `https://reddit.com${post.permalink}`,
              subreddit: post.subreddit,
              itemType: 'submission' as const,
              body: post.selftext || undefined,
              score: post.score,
              editedAt: post.edited === false ? null : Math.floor(post.edited)
            };
          }),
          ...comments.map((item) => {
            const comment = item.data as RedditComment;
            return {
              externalId: comment.name,
              timestamp: Math.floor(comment.created_utc),
              title: truncateText(`Comment on: ${comment.link_title}`, 100),
              url: `https://reddit.com${comment.permalink}`,
              subreddit: comment.subreddit,
              itemType: 'comment' as const,
              body: comment.body,
              score: comment.score,
              editedAt: comment.edited === false ? null : Math.floor(comment.edited)
            };
          })
        ];

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
