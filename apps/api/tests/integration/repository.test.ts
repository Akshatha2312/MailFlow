import { UserRepository } from '../../src/repositories/user.repository';
import { SenderRepository } from '../../src/repositories/sender.repository';
import { EmailJobRepository } from '../../src/repositories/email-job.repository';
import { RateLimitRepository } from '../../src/repositories/rate-limit.repository';
import { prisma } from '../../src/config/prisma';
import { JobStatus, AttemptStatus } from '@prisma/client';

describe('Database Repositories & Domain Persistence (Integration)', () => {
  const testEmail = `test-user-${Date.now()}@example.com`;
  let userId: string;
  let senderId: string;

  beforeAll(async () => {
    // Create test user and sender
    const user = await UserRepository.upsertGoogleUser({
      email: testEmail,
      name: 'Test Engineer',
      providerAccountId: `google-id-${Date.now()}`,
    });
    userId = user.id;

    const sender = await SenderRepository.createSender({
      userId,
      email: `sender-${Date.now()}@domain.com`,
      name: 'Primary Sender',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'test_user',
      smtpPass: 'test_pass',
      hourlyLimit: 50,
      isDefault: true,
    });
    senderId = sender.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('should create and retrieve an EmailJob with idempotency key', async () => {
    const idempotencyKey = `idempotency-key-${Date.now()}`;
    const job = await EmailJobRepository.createJob({
      userId,
      senderId,
      recipient: 'target@customer.com',
      subject: 'Welcome to MailFlow',
      body: '<p>Hello world!</p>',
      scheduledAt: new Date(Date.now() + 3600000),
      idempotencyKey,
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe(JobStatus.SCHEDULED);
    expect(job.idempotencyKey).toBe(idempotencyKey);

    const fetched = await EmailJobRepository.findByIdempotencyKey(idempotencyKey);
    expect(fetched?.id).toBe(job.id);
  });

  it('should enforce state machine transitions on EmailJob', async () => {
    const idempotencyKey = `idempotency-key-state-${Date.now()}`;
    const job = await EmailJobRepository.createJob({
      userId,
      senderId,
      recipient: 'state-target@customer.com',
      subject: 'State Machine Test',
      body: 'Body content',
      scheduledAt: new Date(),
      idempotencyKey,
    });

    // Valid transition: SCHEDULED -> PROCESSING
    const processingJob = await EmailJobRepository.updateStatus(job.id, JobStatus.PROCESSING);
    expect(processingJob.status).toBe(JobStatus.PROCESSING);

    // Valid transition: PROCESSING -> SENT
    const sentJob = await EmailJobRepository.updateStatus(job.id, JobStatus.SENT, {
      sentAt: new Date(),
    });
    expect(sentJob.status).toBe(JobStatus.SENT);
    expect(sentJob.sentAt).toBeDefined();

    // Invalid transition: SENT -> SCHEDULED (must throw Error)
    await expect(EmailJobRepository.updateStatus(job.id, JobStatus.SCHEDULED)).rejects.toThrow(
      /Invalid state transition/
    );
  });

  it('should record delivery attempts for an EmailJob', async () => {
    const idempotencyKey = `idempotency-key-attempt-${Date.now()}`;
    const job = await EmailJobRepository.createJob({
      userId,
      senderId,
      recipient: 'attempt-target@customer.com',
      subject: 'Attempt Log Test',
      body: 'Body content',
      scheduledAt: new Date(),
      idempotencyKey,
    });

    const attempt = await EmailJobRepository.recordAttempt(
      job.id,
      AttemptStatus.FAILED,
      'Connection timed out',
      'ETIMEDOUT'
    );

    expect(attempt.id).toBeDefined();
    expect(attempt.status).toBe(AttemptStatus.FAILED);

    const fetchedJob = await EmailJobRepository.findById(job.id);
    expect(fetchedJob?.attemptsList).toHaveLength(1);
    expect(fetchedJob?.attemptsList[0].error).toBe('Connection timed out');
  });

  it('should track hourly rate limit count atomically in RateLimitRepository', async () => {
    const initialCount = await RateLimitRepository.getSentCountInCurrentWindow(senderId);
    expect(initialCount).toBe(0);

    await RateLimitRepository.incrementSentCount(senderId);
    await RateLimitRepository.incrementSentCount(senderId);

    const updatedCount = await RateLimitRepository.getSentCountInCurrentWindow(senderId);
    expect(updatedCount).toBe(2);
  });
});
