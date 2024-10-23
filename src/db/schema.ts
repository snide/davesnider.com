import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { v4 as uuidv4 } from 'uuid';

export const filesTable = sqliteTable(
  'files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fileId: text('fileId').notNull().unique(),
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

export type VisionImageProperties = {
  dominantColors: {
    colors: {
      color: {
        red: number;
        green: number;
        blue: number;
        alpha: number | null;
      };
      score: number;
      pixelFraction: number;
    }[];
  };
};

export type VisionLabel = {
  mid: string;
  score: number;
  locale: string;
  locations: any[];
  confidence: number;
  properties: any[];
  topicality: number;
  description: string;
  boundingPoly: any | null;
}[];

export type VisionText = {
  mid: string;
  score: number;
  locale: string;
  locations: any[];
  confidence: number;
  properties: any[];
  topicality: number;
  description: string;
  boundingPoly: {
    vertices: {
      x: number;
      y: number;
    }[];
    normalizedVertices: any[];
  } | null;
}[];

export type SelectFileBase = typeof filesTable.$inferSelect;
export type SelectFile = Omit<SelectFileBase, 'visionImageProperties' | 'visionText' | 'visionLabel'> & {
  visionImageProperties: VisionImageProperties | null;
  visionText: VisionText | null;
  visionLabel: VisionLabel | null;
};

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
