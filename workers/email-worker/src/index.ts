import dotenv from 'dotenv';
import path from 'path';
import { Worker } from 'bullmq';
import { getRedisConnectionOptions, validateEnv, Logger } from '@mailflow/shared';
import { processEmailDeliveryJob, EmailDeliveryJobData } from './processor';

// Load environment variables from root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const env = validateEnv();

const concurrency = process.env.WORKER_CONCURRENCY ? parseInt(process.env.WORKER_CONCURRENCY, 10) : 5;
const EMAIL_DELIVERY_QUEUE_NAME = 'email-delivery-queue';

Logger.info(`⚡ Starting MailFlow Dedicated Email Worker Process (Concurrency: ${concurrency})...`);

const worker = new Worker<EmailDeliveryJobData>(
  EMAIL_DELIVERY_QUEUE_NAME,
  async (job) => {
    await processEmailDeliveryJob(job);
  },
  {
    connection: {
      ...getRedisConnectionOptions(env),
    },
    concurrency,
  }
);

worker.on('completed', (job) => {
  Logger.info(`🎉 BullMQ Job ${job.id} completed successfully.`);
});

worker.on('failed', (job, err) => {
  Logger.error(`💥 BullMQ Job ${job?.id} failed with error: ${err.message}`);
});

worker.on('ready', () => {
  Logger.info(`📡 Email Worker is listening on queue '${EMAIL_DELIVERY_QUEUE_NAME}' with concurrency=${concurrency}`);
});

const shutdown = async () => {
  Logger.info('Shutting down Email Worker gracefully...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
