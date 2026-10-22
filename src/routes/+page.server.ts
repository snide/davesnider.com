import { getHomepageTeasers } from '#lib/server/homepage.js';
import { getPosts } from '#lib/utils/posts.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [posts, teasers] = await Promise.all([getPosts(), getHomepageTeasers()]);
  return { posts, ...teasers };
};
