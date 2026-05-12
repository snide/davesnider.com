import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { linksTable } from '$db/schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const links = await db
		.select()
		.from(linksTable)
		.where(eq(linksTable.isPrivate, false))
		.orderBy(desc(linksTable.createdAt))
		.all();

	return { links };
};
