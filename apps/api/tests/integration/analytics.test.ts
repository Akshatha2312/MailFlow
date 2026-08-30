import { UserRepository } from '../../src/repositories/user.repository';
import { SenderRepository } from '../../src/repositories/sender.repository';
import { CampaignRepository } from '../../src/repositories/campaign.repository';
import { AnalyticsRepository } from '../../src/repositories/analytics.repository';
import { prisma } from '../../src/config/prisma';
import { CampaignStatus } from '@prisma/client';

describe('Campaign Analytics Engine (Integration)', () => {
  let userId: string;
  let senderId: string;

  beforeAll(async () => {
    const user = await UserRepository.upsertGoogleUser({
      email: `analytics-user-${Date.now()}@example.com`,
      name: 'Analytics Test User',
      providerAccountId: `google-analytics-${Date.now()}`,
    });
    userId = user.id;

    const sender = await SenderRepository.createSender({
      userId,
      email: `analytics-sender-${Date.now()}@domain.com`,
      name: 'Analytics Sender',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'analytics_user',
      smtpPass: 'analytics_pass',
    });
    senderId = sender.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('should accurately calculate overview metrics and delivery rate percentage from database records', async () => {
    // 1. Create Campaign 1
    const c1 = await CampaignRepository.createCampaign({
      userId,
      senderId,
      name: 'Analytics Test Campaign 1',
      subject: 'Subject 1',
      body: 'Body 1',
    });

    await CampaignRepository.setRecipients(c1.id, userId, [
      { email: 'user1@analytics.com', firstName: 'User1' },
      { email: 'user2@analytics.com', firstName: 'User2' },
    ]);

    // Launch campaign 1
    await CampaignRepository.launchCampaign(c1.id, userId);

    // 2. Fetch overview metrics
    const metrics = await AnalyticsRepository.getOverviewMetrics(userId);

    expect(metrics.totalCampaigns).toBeGreaterThanOrEqual(1);
    expect(metrics.totalRecipients).toBeGreaterThanOrEqual(2);
    expect(metrics.activeCampaigns).toBeGreaterThanOrEqual(1);
    expect(metrics.campaigns.find((c) => c.id === c1.id)).toBeDefined();
    expect(metrics.deliveryRate).toBeGreaterThanOrEqual(0);
  });

  it('should retrieve detailed campaign analytics with recipient breakdown', async () => {
    const c = await CampaignRepository.createCampaign({
      userId,
      senderId,
      name: 'Detailed Analytics Campaign',
      subject: 'Subject',
      body: 'Body',
    });

    await CampaignRepository.setRecipients(c.id, userId, [
      { email: 'det1@test.com', firstName: 'Detailed1' },
    ]);

    const analytics = await AnalyticsRepository.getCampaignAnalytics(c.id, userId);
    expect(analytics.id).toBe(c.id);
    expect(analytics.name).toBe('Detailed Analytics Campaign');
    expect(analytics.recipientBreakdown.pending).toBe(1);
    expect(analytics.recipientBreakdown.sent).toBe(0);
    expect(analytics.deliveryRate).toBe(0);
  });
});
