import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		isLoggedIn: locals.user?.isLoggedIn ?? false
	};
};
