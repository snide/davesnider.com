import { isMediaLogKind, type MediaLogResponse } from '#lib/components/MediaLog/types.js';
import { getPostBySlug } from '#lib/utils/posts.js';
import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const post = await getPostBySlug(params.slug);

  if (!post) {
    throw error(404, `Post not found: ${params.slug}`);
  }

  // Wrong-cased URLs (e.g. /claude-3d for claude-3D.svx) redirect to the canonical slug.
  if (post.slug !== params.slug) {
    throw redirect(301, `/${post.slug}`);
  }

  // A post embedding a media log gets its data here, so the embed renders on
  // the server. A failed fetch is not fatal: the component retries on mount.
  let mediaLog: MediaLogResponse | null = null;
  if (isMediaLogKind(post.metadata.mediaLog)) {
    try {
      const response = await fetch(`/api/activity/log/${post.metadata.mediaLog}`);
      if (response.ok) mediaLog = (await response.json()) as MediaLogResponse;
    } catch {
      mediaLog = null;
    }
  }

  return {
    content: post.default,
    metadata: post.metadata,
    mediaLog
  };
};
