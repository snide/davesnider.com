import { filesTable } from '$db/schema';
import { db } from '$lib/server/db';
import { buildImage } from '$lib/utils/image';
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;

  if (!id) {
    throw redirect(302, '/');
  }

  const file = await db.select().from(filesTable).where(eq(filesTable.fileId, id)).get();

  if (!file) {
    throw error(404, 'File not found');
  }

  const isLoggedIn = locals.user?.isLoggedIn ?? false;

  // Redirect to 404 if the user can't see the file
  if ((file.isHidden || !file.isFavorite) && !isLoggedIn) {
    throw error(404, 'File not found');
  }

  // Only process images through the image CDN
  const image =
    file.fileTypeCategory === 'image'
      ? await buildImage(file.url as string, 'w=1200,h=1200,fit=scale-down')
      : { url: `https://files.davesnider.com/${file.url}`, resizedUrl: `https://files.davesnider.com/${file.url}` };

  const isModel = file.fileTypeCategory === 'model';
  const stlUrl = isModel ? `https://files.davesnider.com/${file.url}` : '';

  return {
    file,
    image,
    isModel,
    stlUrl
  };
};
