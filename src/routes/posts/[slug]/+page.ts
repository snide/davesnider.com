import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Posts used to live at /posts/[slug]; they now live at the site root (/[slug]).
// Keep the old URLs working with permanent redirects.
const slugMap: Record<string, string> = {
  // The museum post collided with the /museum gallery route, so it was renamed.
  museum: 'it-belongs-in-a-museum'
};

export const load: PageLoad = ({ params }) => {
  const slug = slugMap[params.slug] ?? params.slug;
  throw redirect(301, `/${slug}`);
};
