import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { filesTable, galleryTable, galleryToFilesTable } from '$db/schema';
import { eq } from 'drizzle-orm';
import { buildImage } from '$lib/utils/image';

export const GET: RequestHandler = async ({ params }) => {
	const { name } = params;

	const gallery = await db.select().from(galleryTable).where(eq(galleryTable.name, name)).get();

	if (!gallery) {
		return json({ error: `Gallery "${name}" not found` }, { status: 404 });
	}

	const galleryFiles = await db
		.select()
		.from(galleryToFilesTable)
		.where(eq(galleryToFilesTable.galleryId, gallery.id))
		.innerJoin(filesTable, eq(galleryToFilesTable.fileId, filesTable.id))
		.all();

	const images = await Promise.all(
		galleryFiles.map(async (file) => {
			const image = await buildImage(file.files.url as string, 'w=1200,h=1200,fit=scale-down');
			return {
				url: image.url,
				resizedUrl: image.resizedUrl,
				width: image.details?.width,
				height: image.details?.height
			};
		})
	);

	return json({ images });
};
