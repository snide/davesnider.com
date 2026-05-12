import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/utils/posts';

export const load: PageServerLoad = async () => {
	const posts = await getPosts();
	return { posts };
};
