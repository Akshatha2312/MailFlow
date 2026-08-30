import request from 'supertest';
import { app } from '../../src/app';
import { UserRepository } from '../../src/repositories/user.repository';
import { SenderRepository } from '../../src/repositories/sender.repository';
import { CampaignRepository } from '../../src/repositories/campaign.repository';
import { prisma } from '../../src/config/prisma';
import { CampaignStatus } from '@prisma/client';

describe('API Security & Authorization Enforcement', () => {
  let userAId: string;
  let userBId: string;
  let senderAId: string;
  let campaignAId: string;

  beforeAll(async () => {
    // Create User A & User B
    const userA = await UserRepository.upsertGoogleUser({
      email: `security-usera-${Date.now()}@example.com`,
      name: 'User A',
      providerAccountId: `google-user-a-${Date.now()}`,
    });
    userAId = userA.id;

    const userB = await UserRepository.upsertGoogleUser({
      email: `security-userb-${Date.now()}@example.com`,
      name: 'User B',
      providerAccountId: `google-user-b-${Date.now()}`,
    });
    userBId = userB.id;

    const senderA = await SenderRepository.createSender({
      userId: userAId,
      email: `sender-a-${Date.now()}@domain.com`,
      name: 'Sender A',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'user_a',
      smtpPass: 'pass_a',
    });
    senderAId = senderA.id;

    // User A creates a campaign
    const campaignA = await CampaignRepository.createCampaign({
      userId: userAId,
      senderId: senderAId,
      name: 'User A Confidential Campaign',
      subject: 'Confidential Subject',
      body: 'Body',
    });
    campaignAId = campaignA.id;
  });

  afterAll(async () => {
    if (userAId) await prisma.user.delete({ where: { id: userAId } });
    if (userBId) await prisma.user.delete({ where: { id: userBId } });
    await prisma.$disconnect();
  });

  describe('Cross-User Resource Isolation (Authorization)', () => {
    it('should prevent User B from reading User A campaign', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${campaignAId}`)
        .set('Authorization', `Bearer ${userBId}`);

      expect([400, 404]).toContain(res.status);
      expect(res.body.error).toMatch(/Campaign not found or access denied/i);
    });

    it('should prevent User B from updating User A campaign', async () => {
      const res = await request(app)
        .put(`/api/campaigns/${campaignAId}`)
        .set('Authorization', `Bearer ${userBId}`)
        .send({ name: 'Hacked Title' });

      expect([400, 404]).toContain(res.status);
    });

    it('should prevent User B from attaching recipients to User A campaign', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaignAId}/recipients`)
        .set('Authorization', `Bearer ${userBId}`)
        .send({ recipients: [{ email: 'hacked@test.com' }] });

      expect([400, 404]).toContain(res.status);
    });

    it('should prevent User B from launching User A campaign', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaignAId}/launch`)
        .set('Authorization', `Bearer ${userBId}`);

      expect([400, 404]).toContain(res.status);
      expect(res.body.error).toMatch(/Campaign not found or access denied/i);
    });

    it('should prevent User B from deleting User A campaign', async () => {
      const res = await request(app)
        .delete(`/api/campaigns/${campaignAId}`)
        .set('Authorization', `Bearer ${userBId}`);

      expect([400, 404]).toContain(res.status);
    });
  });

  describe('Validation & Malformed Input Handling', () => {
    it('should return 400 Validation Error for missing campaign name', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${userAId}`)
        .send({ subject: 'No Name' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should return 404 for invalid campaign UUID string', async () => {
      const res = await request(app)
        .get('/api/campaigns/non-existent-id')
        .set('Authorization', `Bearer ${userAId}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Campaign State Transition Security', () => {
    it('should reject launching a campaign with 0 recipients', async () => {
      const emptyCampaign = await CampaignRepository.createCampaign({
        userId: userAId,
        senderId: senderAId,
        name: 'Empty Campaign',
        subject: 'Sub',
        body: 'Body',
      });

      const res = await request(app)
        .post(`/api/campaigns/${emptyCampaign.id}/launch`)
        .set('Authorization', `Bearer ${userAId}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no recipients|not found|access denied/i);

      await CampaignRepository.deleteCampaign(emptyCampaign.id, userAId);
    });

    it('should reject re-launching an already COMPLETED campaign', async () => {
      const completedCampaign = await CampaignRepository.createCampaign({
        userId: userAId,
        senderId: senderAId,
        name: 'Completed Campaign',
        subject: 'Sub',
        body: 'Body',
      });

      await CampaignRepository.setRecipients(completedCampaign.id, userAId, [
        { email: 'rec@test.com' },
      ]);

      // Valid state progression: DRAFT -> QUEUED -> SENDING -> COMPLETED
      await CampaignRepository.updateStatus(completedCampaign.id, CampaignStatus.QUEUED);
      await CampaignRepository.updateStatus(completedCampaign.id, CampaignStatus.SENDING);
      await CampaignRepository.updateStatus(completedCampaign.id, CampaignStatus.COMPLETED);

      const res = await request(app)
        .post(`/api/campaigns/${completedCampaign.id}/launch`)
        .set('Authorization', `Bearer ${userAId}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot be launched|access denied|not found/i);

      await prisma.campaign.delete({ where: { id: completedCampaign.id } });
    });
  });
});
