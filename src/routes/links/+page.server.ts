import { linksTable } from '$db/schema';
import { db } from '$lib/server/db';
import { asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const links = await db
    .select()
    .from(linksTable)
    .where(eq(linksTable.isHidden, false))
    .orderBy(asc(linksTable.title))
    .all();

  return { links };
};
