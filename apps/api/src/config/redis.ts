import Redis from 'ioredis';
import { getRedisConnectionOptions, validateEnv } from '@mailflow/shared';

const env = validateEnv();

export const redisClient = new Redis({
  ...getRedisConnectionOptions(env),
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redisClient.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully');
});
