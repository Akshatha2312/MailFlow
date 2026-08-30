import { Queue } from 'bullmq';
import { getRedisConnectionOptions, validateEnv, Logger } from '@mailflow/shared';

const env = validateEnv();

export const EMAIL_DELIVERY_QUEUE_NAME = 'email-delivery-queue';

export const emailQueue = new Queue(EMAIL_DELIVERY_QUEUE_NAME, {
  connection: {
    ...getRedisConnectionOptions(env),
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
