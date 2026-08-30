import { PrismaClient, JobStatus } from '@prisma/client';
import { RateLimitRepository } from '../../src/repositories/rate-limit.repository';

const prisma = new PrismaClient();

describe('Phase 5: Concurrency, Minimum Delay & Atomic Rate Limiting', () => {
  let userId: string;
  let senderId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `concurrency-user-${Date.now()}@test.com`,
        name: 'Concurrency Tester',
      },
    });
    userId = user.id;

    const sender = await prisma.sender.create({
      data: {
        userId,
        email: `concurrency-sender-${Date.now()}@test.com`,
        name: 'Concurrency Sender',
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'test-user',
        smtpPass: 'test-pass',
        hourlyLimit: 5,
      },
    });
    senderId = sender.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should atomically check and increment sender hourly limit without race conditions', async () => {
    const limit = 5;

    // Simulate 10 concurrent worker checks for a limit of 5
    const results = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        RateLimitRepository.checkAndIncrementSenderLimitAtomic(senderId, limit)
      )
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    const rejectedCount = results.filter((r) => !r.allowed).length;

    expect(allowedCount).toBe(5);
    expect(rejectedCount).toBe(5);
  });

  it('should deduplicate Slack rate limit alert notifications within the same hourly window', async () => {
    const testSenderId = `slack-dedup-sender-${Date.now()}`;
    const windowStart = RateLimitRepository.getHourlyWindowStart();
    const windowTimestamp = windowStart.getTime();

    let isSentBefore = await RateLimitRepository.hasSlackAlertBeenSent(testSenderId, windowTimestamp);
    expect(isSentBefore).toBe(false);

    await RateLimitRepository.markSlackAlertSent(testSenderId, windowTimestamp);

    let isSentAfter = await RateLimitRepository.hasSlackAlertBeenSent(testSenderId, windowTimestamp);
    expect(isSentAfter).toBe(true);
  });

  it('should handle stress-scheduling 1000 logical email jobs safely without dropping records or crashing', async () => {
    const batchSize = 1000;
    const scheduledJobsData = Array.from({ length: batchSize }).map((_, i) => ({
      userId,
      senderId,
      recipient: `stress-recipient-${i}-${Date.now()}@customer.com`,
      subject: `Stress Test Job ${i}`,
      body: 'Stress test body content',
      scheduledAt: new Date(),
      status: JobStatus.SCHEDULED,
      idempotencyKey: `stress-idempotency-${userId}-${i}-${Date.now()}`,
    }));

    // Bulk insert 1000 jobs into PostgreSQL
    const createResult = await prisma.emailJob.createMany({
      data: scheduledJobsData,
    });

    expect(createResult.count).toBe(1000);

    const countInDb = await prisma.emailJob.count({
      where: { userId, subject: { startsWith: 'Stress Test Job' } },
    });

    expect(countInDb).toBe(1000);
  }, 30000);
});
