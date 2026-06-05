interface Env {
  GITHUB_USERNAME: string;
  GITHUB_TOKEN?: string;
  ACTIVITY_INGEST_TOKEN: string;
  INGEST_URL: string;
}

type GithubEventType = 'push' | 'pr_opened' | 'pr_merged' | 'issue_opened' | 'issue_comment' | 'release' | 'star';

interface GithubEvent {
  id: string;
  type: string;
  actor: {
    login: string;
  };
  repo: {
    name: string;
    url: string;
  };
  payload: {
    action?: string;
    ref?: string;
    ref_type?: string;
    number?: number;
    commits?: Array<{
      sha: string;
      message: string;
      url: string;
    }>;
    head?: string;
    size?: number;
    pull_request?: {
      number: number;
      title?: string;
      html_url?: string;
      url: string;
      merged?: boolean;
      head?: {
        ref: string;
        sha: string;
      };
    };
    issue?: {
      number: number;
      title: string;
      html_url: string;
      pull_request?: object;
    };
    comment?: {
      id: number;
      body: string;
      html_url: string;
    };
    release?: {
      tag_name: string;
      name: string;
      html_url: string;
    };
  };
  created_at: string;
}

interface ProcessedItem {
  externalId: string;
  timestamp: number;
  title: string;
  url: string;
  eventType: GithubEventType;
  repo: string;
  ref?: string;
  prNumber?: number;
  commitSha?: string;
  commitMessage?: string;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

async function fetchCommit(
  repo: string,
  sha: string,
  token?: string
): Promise<{ message: string; html_url: string } | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'activity-github-worker'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, { headers });

    if (!response.ok) {
      console.error(`Failed to fetch commit ${repo}@${sha}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      message: data.commit?.message?.split('\n')[0] || '',
      html_url: data.html_url
    };
  } catch (err) {
    console.error(`Error fetching commit ${repo}@${sha}:`, err);
    return null;
  }
}

async function fetchPullRequest(
  repo: string,
  prNumber: number,
  token?: string
): Promise<{ title: string; html_url: string; merged: boolean; body: string | null } | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'activity-github-worker'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, { headers });

    if (!response.ok) {
      console.error(`Failed to fetch PR ${repo}#${prNumber}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      title: data.title,
      html_url: data.html_url,
      merged: data.merged,
      body: data.body || null
    };
  } catch (err) {
    console.error(`Error fetching PR ${repo}#${prNumber}:`, err);
    return null;
  }
}

async function fetchUserEvents(username: string, token?: string): Promise<GithubEvent[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'activity-github-worker'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Fetch up to 100 recent events (GitHub's max per page)
  const response = await fetch(`https://api.github.com/users/${username}/events?per_page=100`, {
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch GitHub events: ${response.status} - ${text}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected GitHub API response: ${JSON.stringify(data)}`);
  }

  return data;
}

async function processEvent(event: GithubEvent, token?: string): Promise<ProcessedItem | null> {
  const timestamp = Math.floor(new Date(event.created_at).getTime() / 1000);
  const repo = event.repo.name;

  switch (event.type) {
    case 'PushEvent': {
      const ref = event.payload.ref?.replace('refs/heads/', '') || '';

      // Only track pushes to main/master, skip PR branch pushes
      if (ref !== 'main' && ref !== 'master') return null;

      const commits = event.payload.commits || [];
      const head = event.payload.head;

      let commitMessage: string;
      let commitUrl: string;
      let commitSha: string;

      if (commits.length > 0) {
        const latestCommit = commits[commits.length - 1];
        if (!latestCommit?.message) return null;
        commitMessage = latestCommit.message.split('\n')[0];
        commitUrl =
          latestCommit.url?.replace('api.github.com/repos', 'github.com').replace('/commits/', '/commit/') ||
          `https://github.com/${repo}`;
        commitSha = latestCommit.sha?.substring(0, 7) || '';
      } else if (head) {
        // Fetch commit details if commits array is empty
        const commitData = await fetchCommit(repo, head, token);
        if (!commitData) return null;
        commitMessage = commitData.message;
        commitUrl = commitData.html_url;
        commitSha = head.substring(0, 7);
      } else {
        return null;
      }

      // Skip merge commits (already tracked via PR merged event)
      if (/\(#\d+\)$/.test(commitMessage)) {
        return null;
      }

      console.log(`Push to ${repo}: "${commitMessage}"`);

      return {
        externalId: `push-${event.id}`,
        timestamp,
        title: `Commit ${commitSha} - ${commitMessage}`,
        url: commitUrl,
        eventType: 'push',
        repo,
        ref,
        commitSha,
        commitMessage
      };
    }

    case 'PullRequestEvent': {
      const pr = event.payload.pull_request;
      if (!pr) return null;

      const prNumber = pr.number || event.payload.number;
      if (!prNumber) return null;

      // Fetch full PR details to get the title and body
      const fullPr = await fetchPullRequest(repo, prNumber, token);
      const prTitle = fullPr?.title || pr.head?.ref?.replace(/_/g, ' ') || `PR #${prNumber}`;
      const prUrl = fullPr?.html_url || `https://github.com/${repo}/pull/${prNumber}`;

      let eventType: GithubEventType;
      let title: string;
      let commitMessage: string | undefined;

      if (event.payload.action === 'opened') {
        eventType = 'pr_opened';
        title = `Opened PR #${prNumber} - ${prTitle}`;
        commitMessage = fullPr?.body || undefined;
      } else if (event.payload.action === 'merged' || (event.payload.action === 'closed' && fullPr?.merged)) {
        eventType = 'pr_merged';
        title = `Merged PR #${prNumber} - ${prTitle}`;
      } else {
        return null;
      }

      console.log(`PR #${prNumber}: "${prTitle}"`);

      return {
        externalId: `pr-${repo}-${prNumber}-${eventType}`,
        timestamp,
        title,
        url: prUrl,
        eventType,
        repo,
        prNumber,
        commitMessage
      };
    }

    case 'IssuesEvent': {
      const issue = event.payload.issue;
      if (!issue || !issue.title || event.payload.action !== 'opened') return null;

      return {
        externalId: `issue-${repo}-${issue.number}`,
        timestamp,
        title: `Opened issue #${issue.number} - ${truncateText(issue.title, 60)}`,
        url: issue.html_url,
        eventType: 'issue_opened',
        repo,
        prNumber: issue.number,
        commitMessage: issue.title
      };
    }

    case 'IssueCommentEvent': {
      const comment = event.payload.comment;
      const issue = event.payload.issue;
      if (!comment || !comment.body || !issue || event.payload.action !== 'created') return null;

      // Determine if this is a PR or Issue comment
      const isPR = !!issue.pull_request;
      const itemType = isPR ? 'PR' : 'Issue';

      return {
        externalId: `comment-${repo}-${comment.id}`,
        timestamp,
        title: `Comment on ${itemType} #${issue.number} - ${issue.title}`,
        url: comment.html_url,
        eventType: 'issue_comment',
        repo,
        prNumber: issue.number,
        commitMessage: comment.body
      };
    }

    case 'ReleaseEvent': {
      const release = event.payload.release;
      if (!release || event.payload.action !== 'published') return null;

      return {
        externalId: `release-${repo}-${release.tag_name}`,
        timestamp,
        title: `Released ${release.name || release.tag_name} in ${repo}`,
        url: release.html_url,
        eventType: 'release',
        repo,
        ref: release.tag_name
      };
    }

    case 'WatchEvent': {
      if (event.payload.action !== 'started') return null;

      return {
        externalId: `star-${repo}-${event.id}`,
        timestamp,
        title: `Starred ${repo}`,
        url: `https://github.com/${repo}`,
        eventType: 'star',
        repo
      };
    }

    default:
      return null;
  }
}

async function processEvents(env: Env): Promise<object> {
  console.log(`Fetching events for user: ${env.GITHUB_USERNAME}${env.GITHUB_TOKEN ? ' (authenticated)' : ''}`);
  const events = await fetchUserEvents(env.GITHUB_USERNAME, env.GITHUB_TOKEN);

  // Log event type breakdown
  const typeCounts: Record<string, number> = {};
  for (const event of events) {
    typeCounts[event.type] = (typeCounts[event.type] || 0) + 1;
  }
  console.log(`Fetched ${events.length} events:`, JSON.stringify(typeCounts));

  const items: ProcessedItem[] = [];
  for (const event of events) {
    try {
      const processed = await processEvent(event, env.GITHUB_TOKEN);
      if (processed) {
        items.push(processed);
      }
    } catch (err) {
      console.error(`Error processing event ${event.id} (${event.type}):`, err);
    }
  }
  console.log(`Processed ${items.length} items`);

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

  return response.json();
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('GitHub activity worker triggered');

    try {
      const result = await processEvents(env);
      console.log('GitHub ingest result:', result);
    } catch (error) {
      console.error('GitHub worker error:', error);
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
        const result = await processEvents(env);
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
