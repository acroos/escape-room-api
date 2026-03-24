import crypto from 'crypto';
import {
  buildRedisKey,
  setHold,
  getHold as getHoldFromStore,
  deleteHold,
  extendHold,
} from '@/lib/redis/holds';
import * as roomsRepo from '@/lib/db/repositories/rooms';
import * as reservationsRepo from '@/lib/db/repositories/reservations';

export type HoldResult =
  | { ok: true; reservationCode: string }
  | {
      ok: false;
      reason:
        | 'invalid_timeslot'
        | 'room_not_found'
        | 'already_confirmed'
        | 'already_held';
    };

export type GetHoldResult =
  | { ok: true; ttl: number }
  | { ok: false; reason: 'not_found' | 'code_mismatch' };

export type ReleaseResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'code_mismatch' };

export type ConfirmResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: 'expired' | 'code_mismatch' };

export function validateTimeslot(timeslot: Date): boolean {
  return (
    timeslot.getMinutes() === 0 &&
    timeslot.getSeconds() === 0 &&
    timeslot.getMilliseconds() === 0
  );
}

export async function holdRoom(
  roomId: string,
  timeslot: Date,
): Promise<HoldResult> {
  if (!validateTimeslot(timeslot)) {
    return { ok: false, reason: 'invalid_timeslot' };
  }

  const room = await roomsRepo.findById(roomId);
  if (!room) {
    return { ok: false, reason: 'room_not_found' };
  }

  const existingReservation = await reservationsRepo.findByRoomAndTimeslot(
    roomId,
    timeslot,
  );
  if (existingReservation) {
    return { ok: false, reason: 'already_confirmed' };
  }

  const code = crypto.randomUUID();
  const key = buildRedisKey(roomId, timeslot.toISOString());
  const acquired = await setHold(key, code);
  if (!acquired) {
    return { ok: false, reason: 'already_held' };
  }

  return { ok: true, reservationCode: code };
}

export async function getHold(
  roomId: string,
  timeslot: Date,
  code: string,
): Promise<GetHoldResult> {
  const key = buildRedisKey(roomId, timeslot.toISOString());
  const hold = await getHoldFromStore(key);
  if (!hold) {
    return { ok: false, reason: 'not_found' };
  }
  if (hold.code !== code) {
    return { ok: false, reason: 'code_mismatch' };
  }
  return { ok: true, ttl: hold.ttl };
}

export async function releaseHold(
  roomId: string,
  timeslot: Date,
  code: string,
): Promise<ReleaseResult> {
  const key = buildRedisKey(roomId, timeslot.toISOString());
  const hold = await getHoldFromStore(key);
  if (!hold) {
    return { ok: false, reason: 'not_found' };
  }
  if (hold.code !== code) {
    return { ok: false, reason: 'code_mismatch' };
  }
  await deleteHold(key);
  return { ok: true };
}

export async function confirmReservation(
  roomId: string,
  timeslot: Date,
  code: string,
  email: string,
  fullName: string,
): Promise<ConfirmResult> {
  const key = buildRedisKey(roomId, timeslot.toISOString());

  const extendResult = await extendHold(key, code);
  if (extendResult === 'expired') {
    return { ok: false, reason: 'expired' };
  }
  if (extendResult === 'code_mismatch') {
    return { ok: false, reason: 'code_mismatch' };
  }

  const reservation = await reservationsRepo.create({
    roomId,
    timeslot,
    email,
    fullName,
  });

  await deleteHold(key);

  return { ok: true, reservationId: reservation.id };
}
