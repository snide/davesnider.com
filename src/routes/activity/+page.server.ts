import { activityTable, VALID_ACTIVITY_TYPES, type ActivityType } from '$db/schema';
import { attachSearchExcerpts, buildMatchQuery, withActivityDetails } from '$lib/server/activity';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

function isValidActivityType(type: string): type is ActivityType {
  return VALID_ACTIVITY_TYPES.includes(type as ActivityType);
}

export const load: PageServerLoad = async ({ url, cookies }) => {
  const isAdmin = checkAuth(cookies);
  const limit = 20;
  const typeFilterParam = url.searchParams.get('type');
  const typeFilter = typeFilterParam && isValidActivityType(typeFilterParam) ? typeFilterParam : null;
  const sortOrder = url.searchParams.get('sort') === 'asc' ? 'asc' : 'desc';
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const searchTerm = (url.searchParams.get('q') || '').trim();

  // Build conditions for the main query
  const conditions = [eq(activityTable.isPrivate, false)];

  let matchQuery = '';
  if (searchTerm) {
    // Search matches individual posts, so thread replies are included; the
    // normal feed shows thread roots only.
    matchQuery = buildMatchQuery(searchTerm);
    conditions.push(
      sql`${activityTable.id} IN (SELECT rowid FROM activity_fts WHERE activity_fts MATCH ${matchQuery})`
    );
  } else {
    conditions.push(eq(activityTable.isThreadRoot, true));
  }

  if (typeFilter) {
    conditions.push(eq(activityTable.type, typeFilter));
  }

  // Date range filtering
  if (startDate) {
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    conditions.push(gte(activityTable.timestamp, startTimestamp));
  }

  if (endDate) {
    // Add a day to include the entire end date
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000) + 86400;
    conditions.push(lte(activityTable.timestamp, endTimestamp));
  }

  // Single efficient query: get thread roots, sorted by latest activity
  const orderByExpr = sql`COALESCE(${activityTable.threadLatestTimestamp}, ${activityTable.timestamp})`;
  const activities = await db
    .select()
    .from(activityTable)
    .where(and(...conditions))
    .orderBy(sortOrder === 'asc' ? asc(orderByExpr) : desc(orderByExpr))
    .limit(limit);

  const { activities: activitiesWithDetails, blueskyAuthors } = await withActivityDetails(activities);
  const results = matchQuery ? await attachSearchExcerpts(activitiesWithDetails, matchQuery) : activitiesWithDetails;

  return {
    activities: results,
    blueskyAuthors,
    typeFilter,
    sortOrder,
    startDate,
    endDate,
    searchTerm,
    isAdmin
  };
};
