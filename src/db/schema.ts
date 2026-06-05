import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const filesTable = sqliteTable(
  'files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fileId: text('fileId').notNull().unique(),
    url: text('url'),
    originalUploadDate: integer('original_upload_date', { mode: 'timestamp' }),
    visionLabel: text('vision_label', { mode: 'json' }),
    dominantColors: text('dominant_colors', { mode: 'json' }),
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

export type DominantColor = {
  hex: string;
  pct: number;
};

export type DominantColors = DominantColor[];

export type SelectFileBase = typeof filesTable.$inferSelect;
export type SelectFile = Omit<SelectFileBase, 'visionLabel' | 'dominantColors'> & {
  visionLabel: VisionLabel | null;
  dominantColors: DominantColors | null;
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

// Activity Feed Tables

export const VALID_ACTIVITY_TYPES = ['plex', 'github', 'bluesky', 'reddit', 'hackernews', 'bgg'] as const;
export type ActivityType = (typeof VALID_ACTIVITY_TYPES)[number];

export const activityTable = sqliteTable(
  'activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: VALID_ACTIVITY_TYPES }).notNull(),
    externalId: text('external_id').notNull(),
    timestamp: integer('timestamp').notNull(),
    title: text('title').notNull(),
    url: text('url'),
    thumbnailUrl: text('thumbnail_url'),
    isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
    // Threading support: true for non-Bluesky and Bluesky thread roots
    isThreadRoot: integer('is_thread_root', { mode: 'boolean' }).notNull().default(true),
    // For thread roots, this is the max timestamp of all posts in the thread
    threadLatestTimestamp: integer('thread_latest_timestamp'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`)
  },
  (table) => {
    return {
      idxType: index('idx_activity_type').on(table.type),
      idxTimestamp: index('idx_activity_timestamp').on(table.timestamp),
      uniqueTypeExternalId: uniqueIndex('idx_activity_type_external_id').on(table.type, table.externalId),
      // Index for efficient feed queries: get thread roots sorted by latest activity
      idxThreadFeed: index('idx_activity_thread_feed').on(table.isThreadRoot, table.threadLatestTimestamp)
    };
  }
);

export type SelectActivity = typeof activityTable.$inferSelect;
export type InsertActivity = typeof activityTable.$inferInsert;

// Plex Activity
export const VALID_PLEX_MEDIA_TYPES = ['movie', 'show', 'episode'] as const;
export type PlexMediaType = (typeof VALID_PLEX_MEDIA_TYPES)[number];

export const activityPlexTable = sqliteTable(
  'activity_plex',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activityTable.id, { onDelete: 'cascade' }),
    mediaType: text('media_type', { enum: VALID_PLEX_MEDIA_TYPES }).notNull(),
    imdbId: text('imdb_id'),
    imdbUrl: text('imdb_url'),
    year: integer('year'),
    duration: integer('duration'),
    director: text('director'),
    review: text('review'),
    rating: integer('rating')
  },
  (table) => ({
    idxActivityId: index('idx_plex_activity_id').on(table.activityId)
  })
);

export type SelectActivityPlex = typeof activityPlexTable.$inferSelect;
export type InsertActivityPlex = typeof activityPlexTable.$inferInsert;

// GitHub Activity
export const VALID_GITHUB_EVENT_TYPES = [
  'push',
  'pr_opened',
  'pr_merged',
  'issue_opened',
  'issue_comment',
  'release',
  'star'
] as const;
export type GithubEventType = (typeof VALID_GITHUB_EVENT_TYPES)[number];

export const activityGithubTable = sqliteTable(
  'activity_github',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activityTable.id, { onDelete: 'cascade' }),
    eventType: text('event_type', { enum: VALID_GITHUB_EVENT_TYPES }).notNull(),
    repo: text('repo').notNull(),
    ref: text('ref'),
    prNumber: integer('pr_number'),
    commitSha: text('commit_sha'),
    commitMessage: text('commit_message')
  },
  (table) => ({
    idxActivityId: index('idx_github_activity_id').on(table.activityId)
  })
);

export type SelectActivityGithub = typeof activityGithubTable.$inferSelect;
export type InsertActivityGithub = typeof activityGithubTable.$inferInsert;

// Bluesky Authors (normalized table for author info)
export const blueskyAuthorsTable = sqliteTable('bluesky_authors', {
  did: text('did').primaryKey(),
  handle: text('handle').notNull(),
  displayName: text('display_name'),
  avatar: text('avatar'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

export type SelectBlueskyAuthor = typeof blueskyAuthorsTable.$inferSelect;
export type InsertBlueskyAuthor = typeof blueskyAuthorsTable.$inferInsert;

// Bluesky Activity
export type BlueskyFacet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<{
    $type: string;
    did?: string;
    uri?: string;
    tag?: string;
  }>;
};

export type BlueskyThreadPost = {
  uri: string;
  authorDid: string;
  postText: string;
  createdAt: string;
  images?: string[];
  video?: string; // HLS playlist URL (CORS blocked, use thumbnail instead)
  videoThumbnail?: string; // Thumbnail for video preview
  facets?: BlueskyFacet[];
  replyParentUri?: string; // URI of the post this is replying to (for thread ordering)
};

export const activityBlueskyTable = sqliteTable(
  'activity_bluesky',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activityTable.id, { onDelete: 'cascade' }),
    authorDid: text('author_did').references(() => blueskyAuthorsTable.did),
    postText: text('post_text').notNull(),
    isReply: integer('is_reply', { mode: 'boolean' }).notNull().default(false),
    replyToUri: text('reply_to_uri'),
    rootUri: text('root_uri'),
    images: text('images', { mode: 'json' }).$type<string[]>(),
    facets: text('facets', { mode: 'json' }).$type<BlueskyFacet[]>(),
    threadPosts: text('thread_posts', { mode: 'json' }).$type<BlueskyThreadPost[]>()
  },
  (table) => ({
    idxActivityId: index('idx_bluesky_activity_id').on(table.activityId),
    idxRootUri: index('idx_bluesky_root_uri').on(table.rootUri)
  })
);

export type SelectActivityBluesky = typeof activityBlueskyTable.$inferSelect;
export type InsertActivityBluesky = typeof activityBlueskyTable.$inferInsert;

// Reddit Activity
export const VALID_REDDIT_ITEM_TYPES = ['submission', 'comment'] as const;
export type RedditItemType = (typeof VALID_REDDIT_ITEM_TYPES)[number];

export const activityRedditTable = sqliteTable(
  'activity_reddit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activityTable.id, { onDelete: 'cascade' }),
    subreddit: text('subreddit').notNull(),
    itemType: text('item_type', { enum: VALID_REDDIT_ITEM_TYPES }).notNull(),
    body: text('body'),
    score: integer('score'),
    editedAt: integer('edited_at')
  },
  (table) => ({
    idxActivityId: index('idx_reddit_activity_id').on(table.activityId)
  })
);

export type SelectActivityReddit = typeof activityRedditTable.$inferSelect;
export type InsertActivityReddit = typeof activityRedditTable.$inferInsert;

// Hacker News Activity
export const VALID_HN_ITEM_TYPES = ['story', 'comment', 'ask', 'show'] as const;
export type HnItemType = (typeof VALID_HN_ITEM_TYPES)[number];

export const activityHackernewsTable = sqliteTable(
  'activity_hackernews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activityTable.id, { onDelete: 'cascade' }),
    itemType: text('item_type', { enum: VALID_HN_ITEM_TYPES }).notNull(),
    body: text('body'),
    hnScore: integer('hn_score'),
    commentCount: integer('comment_count'),
    parentId: integer('parent_id'), // Immediate parent (for comments)
    rootId: integer('root_id') // Root story ID (for thread grouping)
  },
  (table) => ({
    idxActivityId: index('idx_hackernews_activity_id').on(table.activityId)
  })
);

export type SelectActivityHackernews = typeof activityHackernewsTable.$inferSelect;
export type InsertActivityHackernews = typeof activityHackernewsTable.$inferInsert;

// BoardGameGeek Activity
export const activityBggTable = sqliteTable(
  'activity_bgg',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activityTable.id, { onDelete: 'cascade' }),
    gameId: integer('game_id').notNull(), // BGG game ID
    playDate: text('play_date'), // YYYY-MM-DD format from BGG
    location: text('location'),
    numPlayers: integer('num_players'),
    comments: text('comments'),
    incomplete: integer('incomplete', { mode: 'boolean' }).default(false)
  },
  (table) => ({
    idxActivityId: index('idx_bgg_activity_id').on(table.activityId)
  })
);

export type SelectActivityBgg = typeof activityBggTable.$inferSelect;
export type InsertActivityBgg = typeof activityBggTable.$inferInsert;

// OpenGraph Cache
export const ogCacheTable = sqliteTable(
  'og_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull().unique(),
    title: text('title'),
    description: text('description'),
    image: text('image'),
    siteName: text('site_name'),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`)
  },
  (table) => {
    return {
      idxUrl: index('idx_og_cache_url').on(table.url)
    };
  }
);

export type SelectOgCache = typeof ogCacheTable.$inferSelect;
export type InsertOgCache = typeof ogCacheTable.$inferInsert;
