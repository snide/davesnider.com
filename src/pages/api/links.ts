import type { APIContext, APIRoute } from 'astro';
import { db, client } from '@db/db';
import { linksTable } from '@db/schema';
import { eq, sql, and } from 'drizzle-orm';
import { sanitizeSearchTerm } from '@lib/sanitizeSearchTerm';

export const GET: APIRoute = async ({ request }: APIContext) => {
  const url = new URL(request.url);
  const searchTermParam = sanitizeSearchTerm(url.searchParams.get('searchTerm') || '');

  try {
    if (searchTermParam !== '') {
      const result = await db
        .select()
        .from(linksTable)
        .where(
          and(
            sql`${linksTable.id} IN (
            SELECT rowid FROM links_fts WHERE links_fts MATCH ${searchTermParam}
          )`,
            eq(linksTable.isPrivate, false)
          )
        )
        .orderBy(linksTable.createdAt)
        .run();
      const rows = result.rows;

      // Access the rows from 'result'

      // Log and return the results
      console.log(rows);
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } else {
      const results = await db
        .select()
        .from(linksTable)
        .where(eq(linksTable.isPrivate, false))
        .orderBy(linksTable.createdAt)
        .run();

      return new Response(JSON.stringify(results.rows), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error: any) {
    console.error('Error executing query:', error);
    return new Response(null, {
      status: error.statusCode || 500,
      statusText: error.message || 'Internal server error'
    });
  }
};
