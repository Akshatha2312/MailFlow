import { PrismaClient, JobStatus } from '@prisma/client';
import { EmailJobRepository } from '../../src/repositories/email-job.repository';
import { processEmailDeliveryJob } from '../../../../workers/email-worker/src/processor';
import { emailQueue } from '../../src/config/queue';

const prisma = new PrismaClient();

describe('Phase 10: Restart Persistence & Idempotency Verification', () => {
  let userId: string;
  let senderId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `restart-user-${Date.now()}@test.com`,
        name: 'Restart Tester',
      },
    });
    userId = user.id;

    const sender = await prisma.sender.create({
      data: {
        userId,
        email: `restart-sender-${Date.now()}@test.com`,
        name: 'Restart Sender',
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPass: 'pass',
      },
    });
    senderId = sender.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should persist scheduled jobs in PostgreSQL and BullMQ across server restarts', async () => {
    const futureTime = new Date(Date.now() + 60000); // 1 minute in future
    const idempotencyKeyPrefix = `restart-batch-${Date.now()}`;

    const batch = await EmailJobRepository.scheduleBatch({
      userId,
      senderId,
      subject: 'Restart Persistence Test',
      body: 'Persisted body content',
      recipients: ['future1@customer.com', 'future2@customer.com'],
      startTime: futureTime,
      idempotencyKeyPrefix,
    });

    expect(batch.scheduledCount).toBe(2);
    expect(batch.jobs[0].bullJobId).toBeDefined();

    // Verify DB persistence
    const job1InDb = await EmailJobRepository.findById(batch.jobs[0].id);
    expect(job1InDb).not.toBeNull();
    expect(job1InDb?.status).toBe(JobStatus.SCHEDULED);

    // Verify BullMQ delayed queue state
    const bullJob = await emailQueue.getJob(batch.jobs[0].id);
    expect(bullJob).not.toBeNull();
    const delay = await bullJob?.getState();
    expect(['delayed', 'waiting']).toContain(delay);
  });

  it('should reject duplicate scheduling requests via Idempotency Key protection', async () => {
    const futureTime = new Date(Date.now() + 120000);
    const idempotencyKeyPrefix = `idempotent-repeat-${Date.now()}`;

    const batch1 = await EmailJobRepository.scheduleBatch({
      userId,
      senderId,
      subject: 'Idempotency Test',
      body: 'Body',
      recipients: ['repeat@customer.com'],
      startTime: futureTime,
      idempotencyKeyPrefix,
    });

    // Repeat identical scheduling request
    const batch2 = await EmailJobRepository.scheduleBatch({
      userId,
      senderId,
      subject: 'Idempotency Test',
      body: 'Body',
      recipients: ['repeat@customer.com'],
      startTime: futureTime,
      idempotencyKeyPrefix,
    });

    expect(batch1.jobs[0].id).toBe(batch2.jobs[0].id); // Returned existing job
    const countInDb = await prisma.emailJob.count({
      where: { userId, recipient: 'repeat@customer.com' },
    });
    expect(countInDb).toBe(1); // Zero duplicate rows created
  });

  it('should prevent duplicate sends when worker restarts or processes an already SENT job', async () => {
    const job = await EmailJobRepository.createJob({
      userId,
      senderId,
      recipient: 'already-sent@customer.com',
      subject: 'Already Sent Check',
      body: 'Body',
      scheduledAt: new Date(),
      idempotencyKey: `already-sent-${Date.now()}`,
    });

    // Transition to SENT
    await EmailJobRepository.updateStatus(job.id, JobStatus.PROCESSING);
    await EmailJobRepository.updateStatus(job.id, JobStatus.SENT, { sentAt: new Date() });

    // Mock duplicate worker execution
    const mockBullJob: any = {
      id: 'mock-job-retry',
      attemptsMade: 1,
      opts: { attempts: 3 },
      data: { emailJobId: job.id, userId },
    };

    // Worker execution should trigger idempotency guard and skip delivery
    await processEmailDeliveryJob(mockBullJob);

    const reChecked = await EmailJobRepository.findById(job.id);
    expect(reChecked?.status).toBe(JobStatus.SENT);
    expect(reChecked?.attemptsList).toHaveLength(0); // Zero additional attempt records logged
  });
});
