import {
  holdRoom,
  getHold,
  releaseHold,
  confirmReservation,
} from '@/lib/reservations/service';

// Mock clients to prevent real connections
jest.mock('@/lib/redis/index', () => ({ redis: {} }));
jest.mock('@/lib/db', () => ({ db: {} }));

// Mock the storage layers
jest.mock('@/lib/redis/holds', () => {
  const actual = jest.requireActual('@/lib/redis/holds');
  return {
    ...actual,
    setHold: jest.fn(),
    getHold: jest.fn(),
    deleteHold: jest.fn(),
    extendHold: jest.fn(),
  };
});
jest.mock('@/lib/db/repositories/rooms');
jest.mock('@/lib/db/repositories/reservations');

import * as holds from '@/lib/redis/holds';
import * as roomsRepo from '@/lib/db/repositories/rooms';
import * as reservationsRepo from '@/lib/db/repositories/reservations';

const mockedHolds = jest.mocked(holds);
const mockedRoomsRepo = jest.mocked(roomsRepo);
const mockedReservationsRepo = jest.mocked(reservationsRepo);

const VALID_ROOM_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
// 2026-04-01T10:00:00Z in ms
const VALID_TIMESLOT = 1775048400000;
const VALID_CODE = 'test-reservation-code';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('holdRoom', () => {
  it('returns invalid_timeslot when timeslot is not on the hour', async () => {
    // Not divisible by 3_600_000
    const result = await holdRoom(VALID_ROOM_ID, 1775048400000 + 1_800_000);
    expect(result).toEqual({ ok: false, reason: 'invalid_timeslot' });
  });

  it('returns timeslot_in_past when timeslot is in the past', async () => {
    // A valid on-the-hour timeslot, but in the past
    const pastTimeslot = 1704067200000; // 2024-01-01T00:00:00Z
    const result = await holdRoom(VALID_ROOM_ID, pastTimeslot);
    expect(result).toEqual({ ok: false, reason: 'timeslot_in_past' });
  });

  it('returns room_not_found when room does not exist', async () => {
    mockedRoomsRepo.findById.mockResolvedValue(null);

    const result = await holdRoom(VALID_ROOM_ID, VALID_TIMESLOT);
    expect(result).toEqual({ ok: false, reason: 'room_not_found' });
  });

  it('returns already_confirmed when timeslot is already reserved', async () => {
    mockedRoomsRepo.findById.mockResolvedValue({
      id: VALID_ROOM_ID,
      name: 'Test Room',
      createdAt: new Date(),
    });
    mockedReservationsRepo.findByRoomAndTimeslot.mockResolvedValue({
      id: 'existing-id',
      roomId: VALID_ROOM_ID,
      timeslot: new Date(VALID_TIMESLOT),
      email: 'test@test.com',
      fullName: 'Test User',
      createdAt: new Date(),
    });

    const result = await holdRoom(VALID_ROOM_ID, VALID_TIMESLOT);
    expect(result).toEqual({ ok: false, reason: 'already_confirmed' });
  });

  it('returns already_held when Redis NX fails', async () => {
    mockedRoomsRepo.findById.mockResolvedValue({
      id: VALID_ROOM_ID,
      name: 'Test Room',
      createdAt: new Date(),
    });
    mockedReservationsRepo.findByRoomAndTimeslot.mockResolvedValue(null);
    mockedHolds.setHold.mockResolvedValue(false);

    const result = await holdRoom(VALID_ROOM_ID, VALID_TIMESLOT);
    expect(result).toEqual({ ok: false, reason: 'already_held' });
  });

  it('returns ok with reservation code on success', async () => {
    mockedRoomsRepo.findById.mockResolvedValue({
      id: VALID_ROOM_ID,
      name: 'Test Room',
      createdAt: new Date(),
    });
    mockedReservationsRepo.findByRoomAndTimeslot.mockResolvedValue(null);
    mockedHolds.setHold.mockResolvedValue(true);

    const result = await holdRoom(VALID_ROOM_ID, VALID_TIMESLOT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reservationCode).toBeDefined();
      expect(typeof result.reservationCode).toBe('string');
    }
  });
});

describe('getHold', () => {
  it('returns not_found when no hold exists', async () => {
    mockedHolds.getHold.mockResolvedValue(null);

    const result = await getHold(VALID_ROOM_ID, VALID_TIMESLOT, VALID_CODE);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns code_mismatch when code does not match', async () => {
    mockedHolds.getHold.mockResolvedValue({ code: 'different-code', ttl: 200 });

    const result = await getHold(VALID_ROOM_ID, VALID_TIMESLOT, VALID_CODE);
    expect(result).toEqual({ ok: false, reason: 'code_mismatch' });
  });

  it('returns ok with ttl when code matches', async () => {
    mockedHolds.getHold.mockResolvedValue({ code: VALID_CODE, ttl: 250 });

    const result = await getHold(VALID_ROOM_ID, VALID_TIMESLOT, VALID_CODE);
    expect(result).toEqual({ ok: true, ttl: 250 });
  });
});

describe('releaseHold', () => {
  it('returns not_found when no hold exists', async () => {
    mockedHolds.getHold.mockResolvedValue(null);

    const result = await releaseHold(VALID_ROOM_ID, VALID_TIMESLOT, VALID_CODE);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns code_mismatch when code does not match', async () => {
    mockedHolds.getHold.mockResolvedValue({ code: 'different-code', ttl: 200 });

    const result = await releaseHold(VALID_ROOM_ID, VALID_TIMESLOT, VALID_CODE);
    expect(result).toEqual({ ok: false, reason: 'code_mismatch' });
  });

  it('deletes hold and returns ok when code matches', async () => {
    mockedHolds.getHold.mockResolvedValue({ code: VALID_CODE, ttl: 200 });

    const result = await releaseHold(VALID_ROOM_ID, VALID_TIMESLOT, VALID_CODE);
    expect(result).toEqual({ ok: true });
    expect(mockedHolds.deleteHold).toHaveBeenCalledWith(
      `room:${VALID_ROOM_ID}:${VALID_TIMESLOT}`,
    );
  });
});

describe('confirmReservation', () => {
  it('returns expired when hold has expired', async () => {
    mockedHolds.extendHold.mockResolvedValue('expired');

    const result = await confirmReservation(
      VALID_ROOM_ID,
      VALID_TIMESLOT,
      VALID_CODE,
      'test@test.com',
      'Test User',
    );
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('returns code_mismatch when code does not match', async () => {
    mockedHolds.extendHold.mockResolvedValue('code_mismatch');

    const result = await confirmReservation(
      VALID_ROOM_ID,
      VALID_TIMESLOT,
      VALID_CODE,
      'test@test.com',
      'Test User',
    );
    expect(result).toEqual({ ok: false, reason: 'code_mismatch' });
  });

  it('creates reservation and deletes hold on success', async () => {
    mockedHolds.extendHold.mockResolvedValue('ok');
    mockedReservationsRepo.create.mockResolvedValue({
      id: 'new-reservation-id',
    });

    const result = await confirmReservation(
      VALID_ROOM_ID,
      VALID_TIMESLOT,
      VALID_CODE,
      'test@test.com',
      'Test User',
    );
    expect(result).toEqual({ ok: true, reservationId: 'new-reservation-id' });
    expect(mockedReservationsRepo.create).toHaveBeenCalledWith({
      roomId: VALID_ROOM_ID,
      timeslot: new Date(VALID_TIMESLOT),
      email: 'test@test.com',
      fullName: 'Test User',
    });
    expect(mockedHolds.deleteHold).toHaveBeenCalled();
  });
});
