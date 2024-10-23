import { createClient } from '@libsql/client/web';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/libsql';

config({ path: '.env' });

const client = createClient({
  url: process.env.TURSO_DB_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
});

export const db = drizzle(client, { casing: 'snake_case' });
