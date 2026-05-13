import { TURSO_AUTH_TOKEN, TURSO_DB_URL } from '$env/static/private';
import { createClient } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql';

const client = createClient({
  url: TURSO_DB_URL,
  authToken: TURSO_AUTH_TOKEN
});

export const db = drizzle(client, { casing: 'snake_case' });
