import Redis from 'ioredis';
import { config } from '@/lib/config';

export const redis = new Redis(config.redisUrl);
