import * as roomsRepo from '@/lib/db/repositories/rooms';

export async function GET() {
  const rooms = await roomsRepo.findAll();
  return Response.json(rooms);
}
