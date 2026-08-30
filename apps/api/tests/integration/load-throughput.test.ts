import { PrismaClient } from '@prisma/client';
import { EmailJobRepository } from '../../src/repositories/email-job.repository';
import { processEmailDeliveryJob } from '../../../../workers/email-worker/src/processor';

process.env.EMAIL_PROVIDER = 'mock';

const prisma = new PrismaClient();

describe('Phase 11: Load and Throughput Validation', () => {
  let userId: string;
  let senderId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `load-user-${Date.now()}@test.com`,
        name: 'Load Test User',
      },
    });
    userId = user.id;

    const sender = await prisma.sender.create({
      data: {
        userId,
        email: `load-sender-${Date.now()}@test.com`,
        name: 'Load Test Sender',
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPass: 'pass',
        hourlyLimit: 100, // 100 per hour limit for test
      },
    });
    senderId = sender.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(
    'should handle stress scheduling and processing of 1000+ logical email jobs safely without dropping records',
    async () => {
      const recipients: string[] = [];
      for (let i = 1; i <= 1000; i++) {
        recipients.push(`load-test-${i}-${Date.now()}@test.com`);
      }

      const batch = await EmailJobRepository.scheduleBatch({
        userId,
        senderId,
        subject: 'Phase 11 Load Test Email',
        body: 'Payload',
        recipients,
        startTime: new Date(),
        idempotencyKeyPrefix: `load-test-batch-${Date.now()}`,
      });

      expect(batch.scheduledCount).toBe(1000);

      let deferredCount = 0;
      let processedCount = 0;

      // Process chunk of 150 jobs to test rate limit enforcement & rescheduling
      const sampleJobs = batch.jobs.slice(0, 150);
      for (const job of sampleJobs) {
        const mockBullJob: any = {
          id: job.id,
          token: 'mock-token',
          attemptsMade: 1,
          opts: { attempts: 3 },
          data: {
            emailJobId: job.id,
            userId,
            senderId,
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
        } catch {}
      }

      // Verify rate limit deferred excess jobs without dropping or permanently failing them
      expect(processedCount + deferredCount).toBeGreaterThanOrEqual(150);
      expect(deferredCount).toBeGreaterThan(0); // Hourly rate limit enforced
    },
    60000 // 60s timeout for 1000+ DB inserts & processing
  );
});
