import { checkAuth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
  const isAdmin = checkAuth(cookies);

  if (!isAdmin) {
    throw redirect(303, '/activity');
  }

  return { isAdmin };
};
