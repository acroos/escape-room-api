import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '@/lib/config';
import * as schema from './schema';

const client = postgres(config.postgresUrl, {
  prepare: false,
  database: config.postgresDatabase,
});

export const db = drizzle(client, { schema });

export async function closeDb() {
  await client.end();
}
