import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { config } from '../config';
import { rooms } from './schema';

async function seed() {
  const client = postgres(config.postgresUrl, {
    database: config.postgresDatabase,
  });
  const db = drizzle(client);

  console.log('Truncating tables...');
  await db.execute(
    sql`TRUNCATE TABLE reservations, rooms RESTART IDENTITY CASCADE`,
  );

  console.log('Seeding rooms...');
  await db
    .insert(rooms)
    .values([
      { name: 'The Haunted Mansion' },
      { name: 'Prison Break' },
      { name: 'Lost in Space' },
      { name: 'The Mad Scientist Lab' },
      { name: 'Pirate Shipwreck' },
    ]);

  const seededRooms = await db.select().from(rooms);
  console.log('Seeded rooms:');
  for (const room of seededRooms) {
    console.log(`  ${room.id} - ${room.name}`);
  }

  await client.end();
  console.log('Done!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
