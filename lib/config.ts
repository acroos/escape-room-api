import dotenv from 'dotenv';

// Load .env.local first (local dev), then .env as fallback.
// In production neither file exists — env vars come from the environment.
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: false });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
} as const;
