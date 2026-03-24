// Mock clients to prevent real connections
jest.mock('@/lib/redis/index', () => ({ redis: {} }));
jest.mock('@/lib/db', () => ({ db: {} }));

import { validateTimeslot } from '@/lib/reservations/service';
import { buildRedisKey } from '@/lib/redis/holds';

describe('validateTimeslot', () => {
  it('accepts a timeslot on the hour', () => {
    expect(validateTimeslot(new Date('2026-04-01T10:00:00.000Z'))).toBe(true);
  });

  it('rejects a timeslot with non-zero minutes', () => {
    expect(validateTimeslot(new Date('2026-04-01T10:30:00.000Z'))).toBe(false);
  });

  it('rejects a timeslot with non-zero seconds', () => {
    expect(validateTimeslot(new Date('2026-04-01T10:00:15.000Z'))).toBe(false);
  });

  it('rejects a timeslot with non-zero milliseconds', () => {
    expect(validateTimeslot(new Date('2026-04-01T10:00:00.500Z'))).toBe(false);
  });

  it('accepts midnight', () => {
    expect(validateTimeslot(new Date('2026-04-01T00:00:00.000Z'))).toBe(true);
  });
});

describe('buildRedisKey', () => {
  it('returns the correct format', () => {
    expect(buildRedisKey('room-123', '2026-04-01T10:00:00.000Z')).toBe(
      'room:room-123:2026-04-01T10:00:00.000Z',
    );
  });
});
