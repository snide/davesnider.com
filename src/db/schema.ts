import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { v4 as uuidv4 } from 'uuid';

export const filesTable = sqliteTable('files', {
  id: text('id')
    .primaryKey()
    .notNull()
    .$default(() => uuidv4()),
  url: text('url'),
  originalUploadDate: integer('original_upload_date', { mode: 'timestamp' }),
  visionLabel: text('vision_label', { mode: 'json' }),
  visionImageProperties: text('vision_image_properties', { mode: 'json' }),
  dominantColor: text('dominant_color'),
  textContent: text('text_content'),
  visionText: text('vision_text', { mode: 'json' }),
  focusColor: text('focus_color'),
  fileTypeCategory: text('file_type_category').notNull().default('unknown'),
  isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false)
});

export const linksTable = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  comment: text('comment'),
  tags: text('tags', { mode: 'json' }),
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`)
});

export type SelectLink = typeof linksTable.$inferSelect;
