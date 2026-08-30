import { UserRepository } from '../../src/repositories/user.repository';
import { SenderRepository } from '../../src/repositories/sender.repository';
import { CampaignRepository } from '../../src/repositories/campaign.repository';
import { EmailJobRepository } from '../../src/repositories/email-job.repository';
import { prisma } from '../../src/config/prisma';
import { CampaignStatus, JobStatus } from '@prisma/client';

describe('Email Campaign Management (Integration)', () => {
  const testEmail = `campaign-user-${Date.now()}@example.com`;
  let userId: string;
  let senderId: string;

  beforeAll(async () => {
    const user = await UserRepository.upsertGoogleUser({
      email: testEmail,
      name: 'Campaign Lead',
      providerAccountId: `google-campaign-${Date.now()}`,
    });
    userId = user.id;

    const sender = await SenderRepository.createSender({
      userId,
      email: `campaign-sender-${Date.now()}@domain.com`,
      name: 'Campaign Sender',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'campaign_user',
      smtpPass: 'campaign_pass',
    });
    senderId = sender.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('should create a DRAFT campaign and attach recipients relationally', async () => {
    const campaign = await CampaignRepository.createCampaign({
      userId,
      senderId,
      name: 'Q3 Product Launch',
      subject: 'Hello {{firstName}}!',
      body: '<p>Welcome {{firstName}} from {{company}}!</p>',
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.status).toBe(CampaignStatus.DRAFT);

    const recipients = await CampaignRepository.setRecipients(campaign.id, userId, [
      { email: 'rec1@test.com', firstName: 'Alice', company: 'TechCorp' },
      { email: 'rec2@test.com', firstName: 'Bob', company: 'DevInc' },
    ]);

    expect(recipients).toHaveLength(2);

    const updated = await CampaignRepository.findById(campaign.id, userId);
    expect(updated?.totalRecipients).toBe(2);
    expect(updated?.recipients[0].firstName).toBe('Alice');
  });

  it('should launch a campaign and generate personalized EmailJobs for each recipient', async () => {
    const campaign = await CampaignRepository.createCampaign({
      userId,
      senderId,
      name: 'Personalized Campaign',
      subject: 'Special offer for {{firstName}} at {{company}}',
      body: 'Hi {{firstName}} {{lastName}}, check this out!',
    });

    await CampaignRepository.setRecipients(campaign.id, userId, [
      { email: 'customer1@test.com', firstName: 'Sarah', lastName: 'Connor', company: 'Skynet' },
    ]);

    const launched = await CampaignRepository.launchCampaign(campaign.id, userId);
    expect([CampaignStatus.QUEUED, CampaignStatus.SENDING]).toContain(launched.status);

    const recipient = launched.recipients[0];
    expect(recipient.emailJobId).toBeDefined();

    const emailJob = await EmailJobRepository.findById(recipient.emailJobId!);
    expect(emailJob?.subject).toBe('Special offer for Sarah at Skynet');
    expect(emailJob?.body).toBe('Hi Sarah Connor, check this out!');
    expect([JobStatus.SCHEDULED, JobStatus.PROCESSING, JobStatus.SENT]).toContain(emailJob?.status);
  });

  it('should prevent illegal state transitions on Campaign', async () => {
    const campaign = await CampaignRepository.createCampaign({
      userId,
      name: 'State Lock Test',
      subject: 'Subject',
      body: 'Body',
    });

    // Valid transition: DRAFT -> CANCELLED
    await CampaignRepository.updateStatus(campaign.id, CampaignStatus.CANCELLED);

    // Invalid transition: CANCELLED -> SENDING without going through DRAFT (must fail)
    await expect(CampaignRepository.updateStatus(campaign.id, CampaignStatus.SENDING)).rejects.toThrow(
      /Invalid state transition/
    );
  });

  it('should prevent unauthorized users from accessing or modifying another user campaign', async () => {
    const campaign = await CampaignRepository.createCampaign({
      userId,
      name: 'Secret Campaign',
      subject: 'Secret Subject',
      body: 'Secret Body',
    });

    const otherUserCampaign = await CampaignRepository.findById(campaign.id, 'unauthorized-user-id');
    expect(otherUserCampaign).toBeNull();

    await expect(
      CampaignRepository.updateCampaign(campaign.id, 'unauthorized-user-id', { name: 'Hacked' })
    ).rejects.toThrow(/not found or access denied/);
  });

  it('should reject campaigns that use a foreign sender and fallback to the user\'s valid sender when none is supplied', async () => {
    const otherUser = await UserRepository.upsertGoogleUser({
      email: `campaign-other-${Date.now()}@example.com`,
      name: 'Other User',
      providerAccountId: `google-other-campaign-${Date.now()}`,
    });

    const foreignSender = await SenderRepository.createSender({
      userId: otherUser.id,
      email: `foreign-sender-${Date.now()}@example.com`,
      name: 'Foreign Sender',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'foreign_user',
      smtpPass: 'foreign_pass',
    });

    await expect(
      CampaignRepository.createCampaign({
        userId,
        senderId: foreignSender.id,
        name: 'Wrong Owner Campaign',
        subject: 'Wrong owner subject',
        body: 'Wrong owner body',
      })
    ).rejects.toThrow(/sender not found or does not belong to the user/i);

    const fallbackCampaign = await CampaignRepository.createCampaign({
      userId,
      name: 'Owned Sender Campaign',
      subject: 'Owned sender subject',
      body: 'Owned sender body',
    });

    const defaultSender = await prisma.sender.findFirst({
      where: { userId, isDefault: true },
    });

    expect(defaultSender).not.toBeNull();
    expect(fallbackCampaign.senderId).toBe(defaultSender?.id);
    expect(fallbackCampaign.userId).toBe(userId);

    await prisma.user.delete({ where: { id: otherUser.id } });
    await prisma.sender.deleteMany({ where: { userId: otherUser.id } });
  });
});
