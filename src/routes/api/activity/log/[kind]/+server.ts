import { isMediaLogKind, type MediaLogResponse } from '#lib/components/MediaLog/types.js';
import { getMediaLog } from '#lib/server/mediaLog.js';
import type { RequestHandler } from './$types';

// Public: the whole log for one kind (reviews included) in a single payload,
// so the MediaLog component sorts, filters and searches without follow-up
// requests. Posts that declare `mediaLog` in their frontmatter also fetch
// this during their load, which is what server-renders the grid.
export const GET: RequestHandler = async ({ params }) => {
  if (!isMediaLogKind(params.kind)) {
    return Response.json({ error: 'Unknown log' }, { status: 404 });
  }

  const body: MediaLogResponse = { kind: params.kind, items: await getMediaLog(params.kind) };
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
  });
};
