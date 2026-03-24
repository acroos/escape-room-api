import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reservations } from '@/lib/db/schema';

export async function findByRoomAndTimeslot(roomId: string, timeslot: Date) {
  const results = await db
    .select()
    .from(reservations)
    .where(
      and(eq(reservations.roomId, roomId), eq(reservations.timeslot, timeslot)),
    )
    .limit(1);
  return results[0] ?? null;
}

export async function create(data: {
  roomId: string;
  timeslot: Date;
  email: string;
  fullName: string;
}) {
  const results = await db
    .insert(reservations)
    .values(data)
    .returning({ id: reservations.id });
  return results[0];
}
