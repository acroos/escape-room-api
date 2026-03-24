import { db, closeDb } from '@/lib/db';
import { rooms, reservations } from '@/lib/db/schema';
import { redis } from '@/lib/redis/index';
import { sql } from 'drizzle-orm';
import { POST as holdHandler } from '@/app/api/reservations/hold/route';
import { GET as getHandler } from '@/app/api/reservations/[room_id]/[timeslot]/route';
import { POST as confirmHandler } from '@/app/api/reservations/confirm/route';
import { POST as releaseHandler } from '@/app/api/reservations/release/route';
import type { NextRequest } from 'next/server';

let testRoomId: string;
// 2026-06-01T14:00:00Z in ms
const TIMESLOT = 1780333200000;
// 2026-06-01T15:00:00Z in ms
const TIMESLOT_2 = 1780336800000;

function makeRequest(
  url: string,
  options: { method?: string; body?: object; headers?: Record<string, string> },
): Request {
  return new Request(url, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

function makeNextRequest(
  url: string,
  options: { headers?: Record<string, string> },
): NextRequest {
  return new Request(url, {
    method: 'GET',
    headers: options.headers,
  }) as unknown as NextRequest;
}

beforeAll(async () => {
  // Clean state
  await db.execute(
    sql`TRUNCATE TABLE reservations, rooms RESTART IDENTITY CASCADE`,
  );
  await redis.flushdb();

  // Insert a test room
  const inserted = await db
    .insert(rooms)
    .values({ name: 'Integration Test Room' })
    .returning({ id: rooms.id });
  testRoomId = inserted[0].id;
});

afterEach(async () => {
  // Clear Redis between tests but keep DB rooms
  await redis.flushdb();
  await db.delete(reservations);
});

afterAll(async () => {
  await redis.flushdb();
  await db.execute(
    sql`TRUNCATE TABLE reservations, rooms RESTART IDENTITY CASCADE`,
  );
  await redis.quit();
  await closeDb();
});

// ─── Hold Flow ───

describe('POST /api/reservations/hold', () => {
  it('returns 201 with reservation code on success', async () => {
    const res = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.reservation_code).toBeDefined();
  });

  it('returns 409 when room/timeslot is already held', async () => {
    await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );
    const res = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('already_held');
  });

  it('returns 400 for invalid timeslot (not on the hour)', async () => {
    const res = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: {
          room_id: testRoomId,
          timeslot: TIMESLOT + 1_800_000,
        },
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_timeslot');
  });

  it('returns 400 for non-existent room', async () => {
    const res = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: {
          room_id: '00000000-0000-0000-0000-000000000000',
          timeslot: TIMESLOT,
        },
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('room_not_found');
  });
});

// ─── Get Hold ───

describe('GET /api/reservations/[room_id]/[timeslot]', () => {
  it('returns 200 with TTL for valid code', async () => {
    const holdRes = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );
    const { reservation_code } = await holdRes.json();

    const res = await getHandler(
      makeNextRequest(
        `http://localhost/api/reservations/${testRoomId}/${TIMESLOT}`,
        { headers: { 'x-reservation-code': reservation_code } },
      ),
      {
        params: Promise.resolve({
          room_id: testRoomId,
          timeslot: String(TIMESLOT),
        }),
      },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ttl).toBeGreaterThan(0);
    expect(data.ttl).toBeLessThanOrEqual(300);
  });

  it('returns 403 for wrong code', async () => {
    await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );

    const res = await getHandler(
      makeNextRequest(
        `http://localhost/api/reservations/${testRoomId}/${TIMESLOT}`,
        { headers: { 'x-reservation-code': 'wrong-code' } },
      ),
      {
        params: Promise.resolve({
          room_id: testRoomId,
          timeslot: String(TIMESLOT),
        }),
      },
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when no hold exists', async () => {
    const res = await getHandler(
      makeNextRequest(
        `http://localhost/api/reservations/${testRoomId}/${TIMESLOT}`,
        { headers: { 'x-reservation-code': 'any-code' } },
      ),
      {
        params: Promise.resolve({
          room_id: testRoomId,
          timeslot: String(TIMESLOT),
        }),
      },
    );
    expect(res.status).toBe(404);
  });
});

// ─── Confirm Flow ───

describe('POST /api/reservations/confirm', () => {
  it('returns 201 with reservation ID on success', async () => {
    const holdRes = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );
    const { reservation_code } = await holdRes.json();

    const res = await confirmHandler(
      makeRequest('http://localhost/api/reservations/confirm', {
        body: {
          room_id: testRoomId,
          timeslot: TIMESLOT,
          email: 'test@example.com',
          full_name: 'Test User',
        },
        headers: { 'x-reservation-code': reservation_code },
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.reservation_id).toBeDefined();
  });

  it('returns 403 for wrong code', async () => {
    await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );

    const res = await confirmHandler(
      makeRequest('http://localhost/api/reservations/confirm', {
        body: {
          room_id: testRoomId,
          timeslot: TIMESLOT,
          email: 'test@example.com',
          full_name: 'Test User',
        },
        headers: { 'x-reservation-code': 'wrong-code' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 for expired hold', async () => {
    // No hold placed — simulates expired
    const res = await confirmHandler(
      makeRequest('http://localhost/api/reservations/confirm', {
        body: {
          room_id: testRoomId,
          timeslot: TIMESLOT,
          email: 'test@example.com',
          full_name: 'Test User',
        },
        headers: { 'x-reservation-code': 'some-code' },
      }),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('expired');
  });

  it('returns 409 when timeslot already confirmed (hold then confirm twice)', async () => {
    // First: hold and confirm
    const holdRes = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );
    const { reservation_code } = await holdRes.json();
    await confirmHandler(
      makeRequest('http://localhost/api/reservations/confirm', {
        body: {
          room_id: testRoomId,
          timeslot: TIMESLOT,
          email: 'test@example.com',
          full_name: 'Test User',
        },
        headers: { 'x-reservation-code': reservation_code },
      }),
    );

    // Second: try to hold the same slot again
    const holdRes2 = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );
    expect(holdRes2.status).toBe(409);
    const data = await holdRes2.json();
    expect(data.error).toBe('already_confirmed');
  });
});

// ─── Release Flow ───

describe('POST /api/reservations/release', () => {
  it('returns 200 and clears hold on success', async () => {
    const holdRes = await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );
    const { reservation_code } = await holdRes.json();

    const res = await releaseHandler(
      makeRequest('http://localhost/api/reservations/release', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
        headers: { 'x-reservation-code': reservation_code },
      }),
    );
    expect(res.status).toBe(200);

    // Verify hold is gone
    const getRes = await getHandler(
      makeNextRequest(
        `http://localhost/api/reservations/${testRoomId}/${TIMESLOT}`,
        { headers: { 'x-reservation-code': reservation_code } },
      ),
      {
        params: Promise.resolve({
          room_id: testRoomId,
          timeslot: String(TIMESLOT),
        }),
      },
    );
    expect(getRes.status).toBe(404);
  });

  it('returns 403 for wrong code', async () => {
    await holdHandler(
      makeRequest('http://localhost/api/reservations/hold', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
      }),
    );

    const res = await releaseHandler(
      makeRequest('http://localhost/api/reservations/release', {
        body: { room_id: testRoomId, timeslot: TIMESLOT },
        headers: { 'x-reservation-code': 'wrong-code' },
      }),
    );
    expect(res.status).toBe(403);
  });
});

// ─── Concurrent Access ───

describe('Concurrent access', () => {
  it('only one of two concurrent hold attempts succeeds', async () => {
    const [res1, res2] = await Promise.all([
      holdHandler(
        makeRequest('http://localhost/api/reservations/hold', {
          body: { room_id: testRoomId, timeslot: TIMESLOT_2 },
        }),
      ),
      holdHandler(
        makeRequest('http://localhost/api/reservations/hold', {
          body: { room_id: testRoomId, timeslot: TIMESLOT_2 },
        }),
      ),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});
