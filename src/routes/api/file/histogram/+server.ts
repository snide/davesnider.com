import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { filesTable } from '$db/schema';
import { and, eq, sql, desc, asc, isNotNull } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const sortOrder = url.searchParams.get('sortOrder') || 'asc';
	const isHiddenParam = url.searchParams.get('isHidden') || 'false';
	const isFavoriteParam = url.searchParams.get('isFavorite') || 'true';
	const mediaTypeParam = url.searchParams.get('mediaType') || 'all';

	// Build filter conditions dynamically
	const filterConditions = [
		eq(filesTable.isHidden, isHiddenParam === 'true'),
		eq(filesTable.isFavorite, isFavoriteParam === 'true'),
		isNotNull(filesTable.originalUploadDate)
	];

	if (mediaTypeParam !== 'all') {
		filterConditions.push(
			eq(filesTable.fileTypeCategory, mediaTypeParam === 'image' ? 'image' : 'video')
		);
	}

	try {
		const strftimeClause = sql`strftime('%Y-%m', datetime(${filesTable.originalUploadDate}, 'unixepoch'))`;

		const groupedResults = await db
			.select({
				month: strftimeClause.as('month'),
				count: sql`COUNT(*)`.as('count')
			})
			.from(filesTable)
			.where(and(...filterConditions))
			.groupBy(strftimeClause)
			.orderBy(sortOrder === 'desc' ? desc(strftimeClause) : asc(strftimeClause));

		let data = groupedResults.map((item) => ({
			x: item.month,
			y: item.count ?? 0
		}));

		// Remove any objects that have 0 for the y value
		data = data.filter((item) => typeof item.y === 'number' && item.y > 0);

		return json(data);
	} catch (error) {
		console.error('Error occurred:', error);
		return json({ message: (error as Error).message }, { status: 500 });
	}
};
