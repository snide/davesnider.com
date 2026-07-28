import { getPostBySlug } from '$lib/utils/posts';
import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  const post = await getPostBySlug(params.slug);

  if (!post) {
    throw error(404, `Post not found: ${params.slug}`);
  }

  // Wrong-cased URLs (e.g. /claude-3d for claude-3D.svx) redirect to the canonical slug.
  if (post.slug !== params.slug) {
    throw redirect(301, `/${post.slug}`);
  }

  return {
    content: post.default,
    metadata: post.metadata
  };
};
