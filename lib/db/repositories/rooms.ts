import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rooms } from '@/lib/db/schema';

export async function findById(roomId: string) {
  const results = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  return results[0] ?? null;
}
