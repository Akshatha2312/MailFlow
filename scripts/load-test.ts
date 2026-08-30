import { PrismaClient } from '@prisma/client';
import { EmailJobRepository } from '../apps/api/src/repositories/email-job.repository';
import { emailQueue } from '../apps/api/src/config/queue';
import { processEmailDeliveryJob } from '../workers/email-worker/src/processor';

// Force mock provider for safe load testing
process.env.EMAIL_PROVIDER = 'mock';

const prisma = new PrismaClient();

async function runLoadTest() {
  console.log('🚀 Starting MailFlow Phase 11 Load & Throughput Validation...');

  const startTime = Date.now();

  // 1. Setup User and Sender
  const user = await prisma.user.create({
    data: {
      email: `loaduser-${Date.now()}@test.com`,
      name: 'Load Test User',
    },
  });

  const sender = await prisma.sender.create({
    data: {
      userId: user.id,
      email: `loadsender-${Date.now()}@test.com`,
      name: 'Load Test Sender',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'user',
      smtpPass: 'pass',
      hourlyLimit: 500, // 500 per hour limit
    },
  });

  console.log(`👤 User created: ${user.id}`);
  console.log(`📧 Sender created: ${sender.id} (Hourly Limit: ${sender.hourlyLimit})`);

  // 2. Generate 1000 logical email recipients
  const RECIPIENT_COUNT = 1000;
  const recipients: string[] = [];
  for (let i = 1; i <= RECIPIENT_COUNT; i++) {
    recipients.push(`loadrecipient_${i}_${Date.now()}@enterprise.com`);
  }

  console.log(`📦 Scheduling ${RECIPIENT_COUNT} logical email jobs scheduled around the same time...`);

  const scheduleStartTime = Date.now();
  const batchResult = await EmailJobRepository.scheduleBatch({
    userId: user.id,
    senderId: sender.id,
    subject: 'High Throughput Load Test Email',
    body: 'Load test body payload',
    recipients,
    startTime: new Date(),
    delaySeconds: 0,
    idempotencyKeyPrefix: `load-batch-${Date.now()}`,
  });
  const scheduleDurationMs = Date.now() - scheduleStartTime;

  console.log(`✅ Scheduling completed in ${scheduleDurationMs}ms (${(RECIPIENT_COUNT / (scheduleDurationMs / 1000)).toFixed(2)} jobs/sec).`);

  // 3. Process jobs with simulated worker loop
  let processedCount = 0;
  let deferredCount = 0;
  let failedCount = 0;

  console.log(`⚙️ Executing high-concurrency worker processing for ${batchResult.jobs.length} jobs...`);
  const processStartTime = Date.now();

  // Process batch of jobs concurrently
  const CONCURRENCY = 10;
  for (let i = 0; i < batchResult.jobs.length; i += CONCURRENCY) {
    const chunk = batchResult.jobs.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (job) => {
        const mockBullJob: any = {
          id: job.id,
          attemptsMade: 1,
          opts: { attempts: 3 },
          data: {
            emailJobId: job.id,
            userId: user.id,
            senderId: sender.id,
            recipient: job.recipient,
            subject: job.subject,
            body: job.body,
          },
          moveToDelayed: async () => {
            deferredCount++;
          },
        };

        try {
          await processEmailDeliveryJob(mockBullJob);
          processedCount++;
        } catch {
          failedCount++;
        }
      })
    );
  }

  const processDurationMs = Date.now() - processStartTime;
  const effectiveThroughput = (processedCount / (processDurationMs / 1000)).toFixed(2);

  // 4. Verify DB Final States
  const sentCountInDb = await prisma.emailJob.count({
    where: { userId: user.id, status: 'SENT' },
  });

  const scheduledCountInDb = await prisma.emailJob.count({
    where: { userId: user.id, status: 'SCHEDULED' },
  });

  console.log('\n================ LOAD TEST REPORT ================');
  console.log(`Total Logical Jobs Scheduled: ${batchResult.scheduledCount}`);
  console.log(`Total Jobs Successfully Sent: ${sentCountInDb}`);
  console.log(`Total Jobs Deferred (Rate Limit): ${deferredCount} (Remain Scheduled)`);
  console.log(`Total Jobs Permanently Failed: ${failedCount}`);
  console.log(`Max Observed Worker Concurrency: ${CONCURRENCY}`);
  console.log(`Effective Worker Throughput: ${effectiveThroughput} emails/sec`);
  console.log(`Total Time Elapsed: ${(Date.now() - startTime) / 1000}s`);
  console.log('==================================================\n');

  await prisma.$disconnect();
}

runLoadTest().catch((err) => {
  console.error('Load test error:', err);
  process.exit(1);
});
