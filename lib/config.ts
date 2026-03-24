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

export interface Config {
  postgresUrl: string;
  postgresDatabase: string;
  redisUrl: string;
}

export const config: Config = {
  postgresUrl: required('POSTGRES_URL'),
  postgresDatabase: required('POSTGRES_DATABASE'),
  redisUrl: required('REDIS_URL'),
};
