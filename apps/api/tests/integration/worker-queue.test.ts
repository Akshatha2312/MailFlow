import { UserRepository } from '../../src/repositories/user.repository';
import { SenderRepository } from '../../src/repositories/sender.repository';
import { CampaignRepository } from '../../src/repositories/campaign.repository';
import { EmailJobRepository } from '../../src/repositories/email-job.repository';
import { prisma } from '../../src/config/prisma';
import { JobStatus, CampaignStatus } from '@prisma/client';
import { Worker } from 'bullmq';
import { EMAIL_DELIVERY_QUEUE_NAME } from '../../src/config/queue';
import { processEmailDeliveryJob } from '../../../../workers/email-worker/src/processor';
import { validateEnv, SMTPEmailProvider } from '@mailflow/shared';

const env = validateEnv();

describe('BullMQ Queue & Async Email Worker Integration', () => {
  let userId: string;
  let senderId: string;
  let worker: Worker;

  beforeAll(async () => {
    // Mock SMTPEmailProvider.sendEmail to avoid slow external network calls to Ethereal API in test
    jest.spyOn(SMTPEmailProvider.prototype, 'sendEmail').mockResolvedValue({
      success: true,
      messageId: '<mock-message-id@test.com>',
      response: '250 OK',
    });

    const user = await UserRepository.upsertGoogleUser({
      email: `worker-user-${Date.now()}@example.com`,
      name: 'Queue Test User',
      providerAccountId: `google-worker-${Date.now()}`,
    });
    userId = user.id;

    const sender = await SenderRepository.createSender({
      userId,
      email: `queue-sender-${Date.now()}@domain.com`,
      name: 'Queue Sender',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'queue_user',
      smtpPass: 'queue_pass',
    });
    senderId = sender.id;

    // Instantiate worker in test process
    worker = new Worker(
      EMAIL_DELIVERY_QUEUE_NAME,
      async (job) => {
        await processEmailDeliveryJob(job as any);
      },
      {
        connection: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD || undefined,
        },
      }
    );
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  it('should process enqueued BullMQ email job and update status to SENT', async () => {
    const campaign = await CampaignRepository.createCampaign({
      userId,
      senderId,
      name: 'Async BullMQ Test Campaign',
      subject: 'Hello {{firstName}}',
      body: '<p>Welcome {{firstName}}</p>',
    });

    await CampaignRepository.setRecipients(campaign.id, userId, [
      { email: 'async-rec1@test.com', firstName: 'David' },
    ]);

    // Launch campaign enqueues jobs to BullMQ
    const launched = await CampaignRepository.launchCampaign(campaign.id, userId);
    expect([CampaignStatus.QUEUED, CampaignStatus.SENDING]).toContain(launched.status);

    const recipient = launched.recipients[0];
    expect(recipient.emailJobId).toBeDefined();

    // Poll until worker completes async delivery
    let updatedJob = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      updatedJob = await EmailJobRepository.findById(recipient.emailJobId!);
      if (updatedJob?.status === JobStatus.SENT) break;
    }

    expect(updatedJob?.status).toBe(JobStatus.SENT);
    expect(updatedJob?.attemptsList.length).toBeGreaterThanOrEqual(1);

    const updatedCampaign = await CampaignRepository.findById(campaign.id, userId);
    expect(['COMPLETED', 'SENDING']).toContain(updatedCampaign?.status);
    expect(updatedCampaign?.sentCount).toBeGreaterThanOrEqual(0);
  }, 15000);

  it('should enforce idempotency guard if worker processes an already SENT job', async () => {
    const idempotencyKey = `idempotency-worker-${Date.now()}`;
    const job = await EmailJobRepository.createJob({
      userId,
      senderId,
      recipient: 'idempotent@test.com',
      subject: 'Idempotent Test',
      body: 'Body',
      scheduledAt: new Date(),
      idempotencyKey,
    });

    // Valid state transitions: SCHEDULED -> PROCESSING -> SENT
    await EmailJobRepository.updateStatus(job.id, JobStatus.PROCESSING);
    await EmailJobRepository.updateStatus(job.id, JobStatus.SENT, { sentAt: new Date() });

    // Mock BullMQ job execution
    const mockBullJob: any = {
      id: 'mock-job-1',
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: { emailJobId: job.id, userId },
    };

    // Processing already SENT job should skip without error or duplicate attempt creation
    await processEmailDeliveryJob(mockBullJob);

    const reChecked = await EmailJobRepository.findById(job.id);
    expect(reChecked?.status).toBe(JobStatus.SENT);
    expect(reChecked?.attemptsList).toHaveLength(0);
  });
});
