import { getHomepageTeasers } from '$lib/server/homepage';
import { getPosts } from '$lib/utils/posts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [posts, teasers] = await Promise.all([getPosts(), getHomepageTeasers()]);
  return { posts, ...teasers };
};
