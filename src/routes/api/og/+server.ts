import { ogCacheTable } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const OG_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface OgData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

async function fetchOgData(url: string): Promise<OgData> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OGBot/1.0)'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return { title: null, description: null, image: null, siteName: null };
    }

    const html = await response.text();

    // Parse OG tags
    const getMetaContent = (property: string): string | null => {
      const regex = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
      const regexAlt = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i');
      const match = html.match(regex) || html.match(regexAlt);
      return match ? match[1] : null;
    };

    const getMetaName = (name: string): string | null => {
      const regex = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
      const regexAlt = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i');
      const match = html.match(regex) || html.match(regexAlt);
      return match ? match[1] : null;
    };

    const getTitle = (): string | null => {
      const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      return match ? match[1].trim() : null;
    };

    return {
      title: getMetaContent('og:title') || getMetaName('twitter:title') || getTitle(),
      description: getMetaContent('og:description') || getMetaName('twitter:description') || getMetaName('description'),
      image: getMetaContent('og:image') || getMetaName('twitter:image'),
      siteName: getMetaContent('og:site_name')
    };
  } catch (err) {
    console.error(`Error fetching OG data for ${url}:`, err);
    return { title: null, description: null, image: null, siteName: null };
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Check cache
  const cached = await db.select().from(ogCacheTable).where(eq(ogCacheTable.url, targetUrl)).get();

  if (cached) {
    const age = Date.now() - (cached.fetchedAt?.getTime() || 0);
    if (age < OG_CACHE_TTL) {
      return json({
        title: cached.title,
        description: cached.description,
        image: cached.image,
        siteName: cached.siteName,
        cached: true
      });
    }
  }

  // Fetch fresh data
  const ogData = await fetchOgData(targetUrl);

  // Upsert cache
  if (cached) {
    await db
      .update(ogCacheTable)
      .set({
        title: ogData.title,
        description: ogData.description,
        image: ogData.image,
        siteName: ogData.siteName,
        fetchedAt: new Date()
      })
      .where(eq(ogCacheTable.url, targetUrl));
  } else {
    await db.insert(ogCacheTable).values({
      url: targetUrl,
      title: ogData.title,
      description: ogData.description,
      image: ogData.image,
      siteName: ogData.siteName
    });
  }

  return json({
    ...ogData,
    cached: false
  });
};
