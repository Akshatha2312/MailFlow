import { Queue } from 'bullmq';
import { validateEnv, Logger } from '@mailflow/shared';

const env = validateEnv();

export const EMAIL_DELIVERY_QUEUE_NAME = 'email-delivery-queue';

export const emailQueue = new Queue(EMAIL_DELIVERY_QUEUE_NAME, {
  connection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

Logger.info(` BullMQ Queue initialized: ${EMAIL_DELIVERY_QUEUE_NAME}`);
