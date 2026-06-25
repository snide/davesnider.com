import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// /posts no longer exists as an index; send it home.
export const load: PageLoad = () => {
  throw redirect(301, '/');
};
