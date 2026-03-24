import { confirmReservation } from '@/lib/reservations/service';

export async function POST(request: Request) {
  const code = request.headers.get('x-reservation-code');
  if (!code) {
    return Response.json(
      { error: 'x-reservation-code header is required' },
      { status: 400 },
    );
  }

  const body = await request.json();
  const { room_id, timeslot, email, full_name } = body;

  if (!room_id || !timeslot || !email || !full_name) {
    return Response.json(
      { error: 'room_id, timeslot, email, and full_name are required' },
      { status: 400 },
    );
  }

  const result = await confirmReservation(
    room_id,
    new Date(timeslot),
    code,
    email,
    full_name,
  );

  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 403 });
  }

  return Response.json(
    { reservation_id: result.reservationId },
    { status: 201 },
  );
}
