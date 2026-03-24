import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rooms } from '@/lib/db/schema';

export type Room = {
  id: string;
  name: string;
  createdAt: Date;
};

export async function findAll(): Promise<Room[]> {
  return db.select().from(rooms);
}

export async function findById(roomId: string): Promise<Room | null> {
  const results = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  return results[0] ?? null;
}
