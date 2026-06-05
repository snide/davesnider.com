import type { BlueskyFacet, BlueskyThreadPost } from '$db/schema';
import { activityBlueskyTable, activityTable, blueskyAuthorsTable } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Sort posts by tree structure - depth-first traversal respecting parent-child relationships
function sortPostsByTree(posts: BlueskyThreadPost[]): BlueskyThreadPost[] {
  if (posts.length <= 1) return posts;

  const postByUri = new Map<string, BlueskyThreadPost>();
  const childrenByParentUri = new Map<string, BlueskyThreadPost[]>();

  for (const post of posts) {
    postByUri.set(post.uri, post);
    const parentUri = post.replyParentUri;
    if (parentUri) {
      const siblings = childrenByParentUri.get(parentUri) || [];
      siblings.push(post);
      childrenByParentUri.set(parentUri, siblings);
    }
  }

  // Sort siblings: replies from others come before self-replies, then by timestamp
  for (const [parentUri, siblings] of childrenByParentUri.entries()) {
    const parent = postByUri.get(parentUri);
    const parentAuthor = parent?.authorDid;

    siblings.sort((a, b) => {
      const aIsSelfReply = parentAuthor && a.authorDid === parentAuthor;
      const bIsSelfReply = parentAuthor && b.authorDid === parentAuthor;

      if (aIsSelfReply && !bIsSelfReply) return 1;
      if (!aIsSelfReply && bIsSelfReply) return -1;

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  const roots = posts.filter((p) => !p.replyParentUri || !postByUri.has(p.replyParentUri));
  roots.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const result: BlueskyThreadPost[] = [];
  const visited = new Set<string>();

  function visit(post: BlueskyThreadPost) {
    if (visited.has(post.uri)) return;
    visited.add(post.uri);
    result.push(post);
    const children = childrenByParentUri.get(post.uri) || [];
    for (const child of children) {
      visit(child);
    }
  }

  for (const root of roots) {
    visit(root);
  }

  for (const post of posts) {
    if (!visited.has(post.uri)) {
      result.push(post);
    }
  }

  return result;
}

interface Author {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface BlueskyItem {
  externalId: string;
  timestamp: number;
  title: string;
  url: string;
  postText: string;
  isReply: boolean;
  replyToUri?: string;
  rootUri: string;
  images?: string[];
  facets?: BlueskyFacet[];
  authorDid: string;
  threadPosts?: BlueskyThreadPost[];
}

interface IngestPayload {
  items: BlueskyItem[];
  authors?: Author[];
  deletedIds?: string[];
}

export const POST: RequestHandler = async ({ request }) => {
  // Validate bearer token
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.ACTIVITY_INGEST_TOKEN;

  if (!expectedToken) {
    return json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload: IngestPayload = await request.json();
    const results = {
      created: 0,
      skipped: 0,
      deleted: 0,
      authorsUpserted: 0,
      errors: [] as string[]
    };

    // Upsert authors first
    if (payload.authors && payload.authors.length > 0) {
      for (const author of payload.authors) {
        try {
          const existing = await db
            .select()
            .from(blueskyAuthorsTable)
            .where(eq(blueskyAuthorsTable.did, author.did))
            .get();

          if (existing) {
            // Update if any fields changed
            await db
              .update(blueskyAuthorsTable)
              .set({
                handle: author.handle,
                displayName: author.displayName || null,
                avatar: author.avatar || null,
                updatedAt: new Date()
              })
              .where(eq(blueskyAuthorsTable.did, author.did));
          } else {
            // Insert new author
            await db.insert(blueskyAuthorsTable).values({
              did: author.did,
              handle: author.handle,
              displayName: author.displayName || null,
              avatar: author.avatar || null
            });
          }
          results.authorsUpserted++;
        } catch (err) {
          results.errors.push(
            `Failed to upsert author ${author.did}: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      }
    }

    // Handle deletions
    if (payload.deletedIds && payload.deletedIds.length > 0) {
      const toDelete = await db
        .select()
        .from(activityTable)
        .where(and(eq(activityTable.type, 'bluesky'), inArray(activityTable.externalId, payload.deletedIds)));

      for (const activity of toDelete) {
        await db.delete(activityTable).where(eq(activityTable.id, activity.id));
        results.deleted++;
      }
    }

    // Process new items
    for (const item of payload.items) {
      try {
        // Check for duplicates
        const existing = await db
          .select()
          .from(activityTable)
          .where(and(eq(activityTable.type, 'bluesky'), eq(activityTable.externalId, item.externalId)))
          .get();

        if (existing) {
          // Even for existing items, merge threadPosts into the thread root if this has captured replies
          if (item.threadPosts && item.threadPosts.length > 0 && item.rootUri) {
            // Find the thread root
            let threadRootForMerge = await db
              .select()
              .from(activityTable)
              .where(and(eq(activityTable.type, 'bluesky'), eq(activityTable.externalId, item.rootUri)))
              .get();

            if (!threadRootForMerge) {
              const existingThreadRoot = await db
                .select({ activity: activityTable })
                .from(activityTable)
                .innerJoin(activityBlueskyTable, eq(activityTable.id, activityBlueskyTable.activityId))
                .where(
                  and(
                    eq(activityTable.type, 'bluesky'),
                    eq(activityTable.isThreadRoot, true),
                    eq(activityBlueskyTable.rootUri, item.rootUri)
                  )
                )
                .get();

              if (existingThreadRoot) {
                threadRootForMerge = existingThreadRoot.activity;
              }
            }

            if (threadRootForMerge) {
              const rootBlueskyDetail = await db
                .select()
                .from(activityBlueskyTable)
                .where(eq(activityBlueskyTable.activityId, threadRootForMerge.id))
                .get();

              if (rootBlueskyDetail) {
                const existingPosts = rootBlueskyDetail.threadPosts || [];
                const existingUris = new Set(existingPosts.map((p) => p.uri));
                const newPosts = item.threadPosts.filter((p) => !existingUris.has(p.uri));

                if (newPosts.length > 0) {
                  const mergedPosts = sortPostsByTree([...existingPosts, ...newPosts]);

                  await db
                    .update(activityBlueskyTable)
                    .set({ threadPosts: mergedPosts })
                    .where(eq(activityBlueskyTable.activityId, threadRootForMerge.id));
                }
              }
            }
          }

          results.skipped++;
          continue;
        }

        // Determine if this is a thread root
        const isRoot = !item.rootUri || item.rootUri === item.externalId;

        // For replies, find the thread root activity
        // For root posts, check if a reply is already acting as thread root
        let threadRootActivity = null;
        let replyActingAsRoot = null;

        if (isRoot) {
          // This is a true root post - check if a reply already claimed thread root status
          const existingProxyRoot = await db
            .select({ activity: activityTable })
            .from(activityTable)
            .innerJoin(activityBlueskyTable, eq(activityTable.id, activityBlueskyTable.activityId))
            .where(
              and(
                eq(activityTable.type, 'bluesky'),
                eq(activityTable.isThreadRoot, true),
                eq(activityBlueskyTable.rootUri, item.externalId)
              )
            )
            .get();

          if (existingProxyRoot) {
            replyActingAsRoot = existingProxyRoot.activity;
          }
        } else if (item.rootUri) {
          // First, check if we have the actual root post
          threadRootActivity = await db
            .select()
            .from(activityTable)
            .where(and(eq(activityTable.type, 'bluesky'), eq(activityTable.externalId, item.rootUri)))
            .get();

          // If not, check if we have another reply to the same thread that's acting as the root
          if (!threadRootActivity) {
            const existingThreadRoot = await db
              .select({ activity: activityTable })
              .from(activityTable)
              .innerJoin(activityBlueskyTable, eq(activityTable.id, activityBlueskyTable.activityId))
              .where(
                and(
                  eq(activityTable.type, 'bluesky'),
                  eq(activityTable.isThreadRoot, true),
                  eq(activityBlueskyTable.rootUri, item.rootUri)
                )
              )
              .get();

            if (existingThreadRoot) {
              threadRootActivity = existingThreadRoot.activity;
            }
          }

          // Update root's threadLatestTimestamp if this post is newer
          if (threadRootActivity && item.timestamp > (threadRootActivity.threadLatestTimestamp || 0)) {
            await db
              .update(activityTable)
              .set({ threadLatestTimestamp: item.timestamp })
              .where(eq(activityTable.id, threadRootActivity.id));
          }

          // If this item has threadPosts with captured replies, merge them into the thread root
          if (threadRootActivity && item.threadPosts && item.threadPosts.length > 0) {
            const rootBlueskyDetail = await db
              .select()
              .from(activityBlueskyTable)
              .where(eq(activityBlueskyTable.activityId, threadRootActivity.id))
              .get();

            if (rootBlueskyDetail) {
              const existingPosts = rootBlueskyDetail.threadPosts || [];
              const existingUris = new Set(existingPosts.map((p) => p.uri));

              // Add any new posts from this item's threadPosts
              const newPosts = item.threadPosts.filter((p) => !existingUris.has(p.uri));

              if (newPosts.length > 0) {
                const mergedPosts = sortPostsByTree([...existingPosts, ...newPosts]);

                await db
                  .update(activityBlueskyTable)
                  .set({ threadPosts: mergedPosts })
                  .where(eq(activityBlueskyTable.activityId, threadRootActivity.id));
              }
            }
          }
        }

        // Determine if this should be marked as thread root:
        // - True root post: only if no reply is already acting as thread root
        // - Reply: only if no thread root exists yet
        const effectiveIsRoot = isRoot ? !replyActingAsRoot : !threadRootActivity;

        // If a reply is acting as root, merge this post into that thread
        if (replyActingAsRoot) {
          const proxyRootBluesky = await db
            .select()
            .from(activityBlueskyTable)
            .where(eq(activityBlueskyTable.activityId, replyActingAsRoot.id))
            .get();

          if (proxyRootBluesky) {
            const existingPosts = proxyRootBluesky.threadPosts || [];
            const existingUris = new Set(existingPosts.map((p) => p.uri));

            // Create a thread post entry for this root post
            const rootPost: BlueskyThreadPost = {
              uri: item.externalId,
              authorDid: item.authorDid,
              postText: item.postText,
              createdAt: new Date(item.timestamp).toISOString(),
              images: item.images,
              facets: item.facets
            };

            if (!existingUris.has(rootPost.uri)) {
              const mergedPosts = sortPostsByTree([rootPost, ...existingPosts]);

              await db
                .update(activityBlueskyTable)
                .set({ threadPosts: mergedPosts })
                .where(eq(activityBlueskyTable.activityId, replyActingAsRoot.id));
            }
          }
        }

        // Create the activity record
        const [activity] = await db
          .insert(activityTable)
          .values({
            type: 'bluesky',
            externalId: item.externalId,
            timestamp: item.timestamp,
            title: item.title,
            url: item.url,
            thumbnailUrl: null,
            isPrivate: false,
            isThreadRoot: effectiveIsRoot,
            threadLatestTimestamp: effectiveIsRoot ? item.timestamp : null
          })
          .returning();

        // Create the Bluesky-specific record
        await db.insert(activityBlueskyTable).values({
          activityId: activity.id,
          authorDid: item.authorDid,
          postText: item.postText,
          isReply: item.isReply,
          replyToUri: item.replyToUri || null,
          rootUri: item.rootUri,
          images: item.images || null,
          facets: item.facets || null,
          threadPosts: item.threadPosts || null
        });

        results.created++;
      } catch (err) {
        results.errors.push(
          `Failed to process item ${item.externalId}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    return json({ success: true, results });
  } catch (err) {
    return json(
      { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
