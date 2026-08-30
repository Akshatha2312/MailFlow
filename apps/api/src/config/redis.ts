import Redis from 'ioredis';
import { validateEnv } from '@mailflow/shared';

const env = validateEnv();

export const redisClient = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redisClient.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully');
});
