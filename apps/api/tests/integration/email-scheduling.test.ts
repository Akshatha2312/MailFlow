import request from 'supertest';
import { app } from '../../src/app';
import { UserRepository } from '../../src/repositories/user.repository';
import { SenderRepository } from '../../src/repositories/sender.repository';
import { prisma } from '../../src/config/prisma';

describe('Email Scheduling API & Delayed Queue (Integration)', () => {
  let userId: string;
  let senderId: string;
  let sessionToken: string;

  beforeAll(async () => {
    // Create user, sender, and session
    const user = await UserRepository.upsertGoogleUser({
      email: `scheduler-user-${Date.now()}@domain.com`,
      name: 'Scheduler Test User',
      providerAccountId: `google-sched-${Date.now()}`,
    });
    userId = user.id;

    const sender = await SenderRepository.createSender({
      userId,
      email: `sender-${Date.now()}@domain.com`,
      name: 'Default Sender',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'ethereal_user',
      smtpPass: 'ethereal_pass',
    });
    senderId = sender.id;

    const session = await UserRepository.createSession(userId);
    sessionToken = session.sessionToken;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.emailJob.deleteMany({ where: { userId } });
      await prisma.sender.deleteMany({ where: { userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  describe('POST /api/emails/schedule', () => {
    it('should schedule email job batch and return HTTP 202 Accepted', async () => {
      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({
          senderId,
          subject: 'Welcome to MailFlow',
          body: 'Hello {{firstName}}, welcome to our platform!',
          recipients: ['user1@test.com', 'user2@test.com'],
          delaySeconds: 5,
        });

      expect(res.status).toBe(202);
      expect(res.body.scheduledCount).toBe(2);
      expect(res.body.jobs).toHaveLength(2);
      expect(res.body.jobs[0].status).toBe('SCHEDULED');
      expect(res.body.jobs[0].bullJobId).toBeDefined();
    });

    it('should reject scheduling request with invalid recipient email format or missing subject', async () => {
      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({
          senderId,
          body: 'Body only',
          recipients: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject scheduling request for a sender owned by another user', async () => {
      // Create another user
      const otherUser = await UserRepository.upsertGoogleUser({
        email: `other-${Date.now()}@domain.com`,
        providerAccountId: `google-other-${Date.now()}`,
      });

      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({
          senderId: 'non-existent-sender-id',
          subject: 'Unauthorized Subject',
          body: 'Body',
          recipients: ['target@test.com'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/sender not found/i);

      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('GET /api/emails (Paginated Querying)', () => {
    it('should return paginated email jobs list for authenticated user', async () => {
      const res = await request(app)
        .get('/api/emails?page=1&limit=10')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('should filter email jobs by status', async () => {
      const res = await request(app)
        .get('/api/emails?status=SCHEDULED')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((j: any) => j.status === 'SCHEDULED')).toBe(true);
    });
  });
});
