import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const filesTable = sqliteTable(
  'files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fileId: text('fileId').notNull().unique(),
    url: text('url'),
    originalUploadDate: integer('original_upload_date', { mode: 'timestamp' }),
    visionLabel: text('vision_label', { mode: 'json' }),
    dominantColor: text('dominant_color'),
    textContent: text('text_content'),
    focusColor: text('focus_color'),
    fileTypeCategory: text('file_type_category').notNull().default('unknown'),
    isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => {
    return {
      idxFileId: index('idx_file_id').on(table.fileId),
      idxOriginalUploadDate: index('idx_original_upload_date').on(table.originalUploadDate),
      idxFileTypeCategory: index('idx_file_type_category').on(table.fileTypeCategory),
      idxIsHidden: index('idx_is_hidden').on(table.isHidden),
      idxIsFavorite: index('idx_is_favorite').on(table.isFavorite)
    };
  }
);

export type VisionLabel = {
  mid: string;
  score: number;
  locale: string;
  locations: unknown[];
  confidence: number;
  properties: unknown[];
  topicality: number;
  description: string;
  boundingPoly: unknown | null;
}[];

export type SelectFileBase = typeof filesTable.$inferSelect;
export type SelectFile = Omit<SelectFileBase, 'visionLabel'> & {
  visionLabel: VisionLabel | null;
};

export const linksTable = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  comment: text('comment'),
  tags: text('tags'),
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`)
});

export type SelectLink = typeof linksTable.$inferSelect;

export const galleryTable = sqliteTable('gallery', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique()
});

export type SelectGallery = typeof galleryTable.$inferSelect;

export const galleryToFilesTable = sqliteTable(
  'gallery_to_files',
  {
    galleryId: integer('gallery_id')
      .notNull()
      .references(() => galleryTable.id, { onDelete: 'cascade' }),
    fileId: integer('file_id')
      .notNull()
      .references(() => filesTable.id, { onDelete: 'cascade' })
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.galleryId, table.fileId] })
    };
  }
);

export type SelectGalleryToFile = typeof galleryToFilesTable.$inferSelect;
