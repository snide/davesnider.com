import { getPosts } from '$lib/utils/posts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const posts = await getPosts();
  return { posts };
};
