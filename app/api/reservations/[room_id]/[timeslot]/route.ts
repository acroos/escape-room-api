import type { NextRequest } from 'next/server';
import { getHold } from '@/lib/reservations/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ room_id: string; timeslot: string }> },
) {
  const { room_id, timeslot } = await params;
  const code = request.headers.get('x-reservation-code');

  if (!code) {
    return Response.json(
      { error: 'x-reservation-code header is required' },
      { status: 400 },
    );
  }

  const result = await getHold(room_id, new Date(timeslot), code);

  if (!result.ok) {
    const statusMap = {
      not_found: 404,
      code_mismatch: 403,
    } as const;
    return Response.json(
      { error: result.reason },
      { status: statusMap[result.reason] },
    );
  }

  return Response.json({ ttl: result.ttl });
}
