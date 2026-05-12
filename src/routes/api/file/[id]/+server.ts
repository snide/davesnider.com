import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { filesTable } from '$db/schema';
import { eq } from 'drizzle-orm';
import { checkAuth } from '$lib/server/auth';

export const POST: RequestHandler = async ({ params, cookies }) => {
	const isAdmin = checkAuth(cookies);

	if (!isAdmin) {
		throw error(401, 'Unauthorized');
	}

	const file = await db.select().from(filesTable).where(eq(filesTable.fileId, params.id)).get();

	if (!file) {
		throw error(404, 'File not found');
	}

	return json(file);
};
