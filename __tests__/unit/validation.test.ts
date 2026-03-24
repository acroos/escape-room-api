// Mock clients to prevent real connections
jest.mock('@/lib/redis/index', () => ({ redis: {} }));
jest.mock('@/lib/db', () => ({ db: {} }));

import { validateTimeslot } from '@/lib/reservations/service';
import { buildRedisKey } from '@/lib/redis/holds';

describe('validateTimeslot', () => {
  it('accepts a timeslot on the hour (ms)', () => {
    // 2026-04-01T10:00:00Z
    expect(validateTimeslot(1775048400000)).toBe(true);
  });

  it('rejects a timeslot not on the hour', () => {
    // 10:30 = +30min in ms
    expect(validateTimeslot(1775048400000 + 1_800_000)).toBe(false);
  });

  it('rejects zero', () => {
    expect(validateTimeslot(0)).toBe(false);
  });

  it('rejects negative values', () => {
    expect(validateTimeslot(-3_600_000)).toBe(false);
  });

  it('accepts midnight epoch', () => {
    // 1970-01-01T01:00:00Z = 3600000ms
    expect(validateTimeslot(3_600_000)).toBe(true);
  });
});

describe('buildRedisKey', () => {
  it('returns the correct format', () => {
    expect(buildRedisKey('room-123', 1775048400000)).toBe(
      'room:room-123:1775048400000',
    );
  });
});
