import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	try {
		const post = await import(`../../../content/posts/${params.slug}.svx`);

		return {
			content: post.default,
			metadata: post.metadata
		};
	} catch {
		throw error(404, `Post not found: ${params.slug}`);
	}
};
