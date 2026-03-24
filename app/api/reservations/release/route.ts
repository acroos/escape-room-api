import { releaseHold } from '@/lib/reservations/service';

export async function POST(request: Request) {
  const code = request.headers.get('x-reservation-code');
  if (!code) {
    return Response.json(
      { error: 'x-reservation-code header is required' },
      { status: 400 },
    );
  }

  const body = await request.json();
  const { room_id, timeslot } = body;

  if (!room_id || timeslot === undefined) {
    return Response.json(
      { error: 'room_id and timeslot are required' },
      { status: 400 },
    );
  }

  const result = await releaseHold(room_id, Number(timeslot), code);

  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 403 });
  }

  return Response.json({ success: true });
}
