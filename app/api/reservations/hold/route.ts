import { holdRoom } from '@/lib/reservations/service';

export async function POST(request: Request) {
  const body = await request.json();
  const { room_id, timeslot } = body;

  if (!room_id || !timeslot) {
    return Response.json(
      { error: 'room_id and timeslot are required' },
      { status: 400 },
    );
  }

  const result = await holdRoom(room_id, new Date(timeslot));

  if (!result.ok) {
    const statusMap = {
      invalid_timeslot: 400,
      room_not_found: 400,
      already_confirmed: 409,
      already_held: 409,
    } as const;
    return Response.json(
      { error: result.reason },
      { status: statusMap[result.reason] },
    );
  }

  return Response.json(
    { reservation_code: result.reservationCode },
    { status: 201 },
  );
}
