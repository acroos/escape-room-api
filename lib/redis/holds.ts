import { redis } from './index';

const HOLD_TTL_SECONDS = 300; // 5 minutes
const CONFIRM_EXTEND_TTL_SECONDS = 15;

const EXTEND_HOLD_LUA = `
local current = redis.call('GET', KEYS[1])
if current == false then
  return 0
end
if current ~= ARGV[1] then
  return -1
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
`;

export function buildRedisKey(roomId: string, timeslot: string): string {
  return `room:${roomId}:${timeslot}`;
}

export async function setHold(key: string, code: string): Promise<boolean> {
  const result = await redis.set(key, code, 'EX', HOLD_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function getHold(
  key: string,
): Promise<{ code: string; ttl: number } | null> {
  const [code, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
  if (!code || ttl < 0) {
    return null;
  }
  return { code, ttl };
}

export async function deleteHold(key: string): Promise<void> {
  await redis.del(key);
}

export async function extendHold(
  key: string,
  expectedCode: string,
): Promise<'ok' | 'expired' | 'code_mismatch'> {
  const result = await redis.eval(
    EXTEND_HOLD_LUA,
    1,
    key,
    expectedCode,
    CONFIRM_EXTEND_TTL_SECONDS.toString(),
  );
  if (result === 1) return 'ok';
  if (result === 0) return 'expired';
  return 'code_mismatch';
}
