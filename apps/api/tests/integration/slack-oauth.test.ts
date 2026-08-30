import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { SlackNotificationService } from '@mailflow/shared';

describe('Phase 6: Real Slack OAuth Integration & Notification Service', () => {
  let userId: string;
  let sessionToken: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `slack-user-${Date.now()}@test.com`,
        name: 'Slack OAuth Tester',
      },
    });
    userId = user.id;

    const session = await prisma.session.create({
      data: {
        sessionToken: `slack-session-${Date.now()}`,
        userId,
        expires: new Date(Date.now() + 86400000),
      },
    });
    sessionToken = session.sessionToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/integrations/slack/status', () => {
    it('should return isConnected: false when user has no active Slack connection', async () => {
      const res = await request(app)
        .get('/api/integrations/slack/status')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isConnected).toBe(false);
      expect(res.body.accessToken).toBeUndefined();
    });

    it('should return isConnected: true with team details when Slack is connected (never exposing access tokens)', async () => {
      await prisma.slackConnection.create({
        data: {
          userId,
          slackUserId: 'U12345678',
          teamId: 'T87654321',
          teamName: 'ReachInbox Workspace',
          accessToken: 'xoxb-secret-slack-token-12345',
          webhookUrl: 'https://hooks.slack.com/services/T123/B456/XYZ789',
        },
      });

      const res = await request(app)
        .get('/api/integrations/slack/status')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isConnected).toBe(true);
      expect(res.body.teamName).toBe('ReachInbox Workspace');
      expect(res.body.teamId).toBe('T87654321');
      expect(res.body.accessToken).toBeUndefined(); // Token privacy guard
    });
  });

  describe('POST /api/integrations/slack/disconnect', () => {
    it('should disconnect Slack integration and invalidate stored connection in PostgreSQL', async () => {
      const res = await request(app)
        .post('/api/integrations/slack/disconnect')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('disconnected');

      const checkStatus = await request(app)
        .get('/api/integrations/slack/status')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(checkStatus.body.isConnected).toBe(false);
    });
  });

  describe('SlackNotificationService', () => {
    it('should handle missing webhookUrl gracefully without throwing an unhandled error', async () => {
      const result = await SlackNotificationService.sendRateLimitAlert({
        webhookUrl: '',
        senderEmail: 'test-sender@domain.com',
        hourlyLimit: 100,
      });

      expect(result).toBe(false);
    });

    it('should handle Slack API / webhook HTTP network errors gracefully', async () => {
      const result = await SlackNotificationService.sendRateLimitAlert({
        webhookUrl: 'https://invalid-slack-webhook-domain-xyz.com/hooks/test',
        senderEmail: 'test-sender@domain.com',
        hourlyLimit: 100,
      });

      expect(result).toBe(false);
    });
  });
});
