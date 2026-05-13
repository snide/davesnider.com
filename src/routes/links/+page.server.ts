import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { linksTable } from '$db/schema';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const links = await db
		.select()
		.from(linksTable)
		.where(eq(linksTable.isPrivate, false))
		.orderBy(asc(linksTable.title))
		.all();

	return { links };
};
