// Mock clients to prevent real connections
jest.mock('@/lib/redis/index', () => ({ redis: {} }));
jest.mock('@/lib/db', () => ({ db: {} }));

import { validateTimeslot } from '@/lib/reservations/service';
import { buildRedisKey } from '@/lib/redis/holds';

describe('validateTimeslot', () => {
  it('accepts a timeslot on the hour', () => {
    // 2026-04-01T10:00:00Z = 1775048400
    expect(validateTimeslot(1775048400)).toBe(true);
  });

  it('rejects a timeslot not divisible by 3600', () => {
    // 10:30 = 1775048400 + 1800
    expect(validateTimeslot(1775050200)).toBe(false);
  });

  it('rejects zero', () => {
    expect(validateTimeslot(0)).toBe(false);
  });

  it('rejects negative values', () => {
    expect(validateTimeslot(-3600)).toBe(false);
  });

  it('accepts midnight epoch', () => {
    // 1970-01-01T01:00:00Z = 3600
    expect(validateTimeslot(3600)).toBe(true);
  });
});

describe('buildRedisKey', () => {
  it('returns the correct format', () => {
    expect(buildRedisKey('room-123', 1775048400)).toBe(
      'room:room-123:1775048400',
    );
  });
});
