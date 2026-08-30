import request from 'supertest';
import { app } from '../../src/app';
import { UserRepository } from '../../src/repositories/user.repository';
import { prisma } from '../../src/config/prisma';

describe('Google OAuth & Session Authentication', () => {
  let testUserId: string;
  let sessionToken: string;

  beforeAll(async () => {
    // Create test user and session
    const user = await UserRepository.upsertGoogleUser({
      email: `authtest-${Date.now()}@domain.com`,
      name: 'Auth Test User',
      providerAccountId: `google-authtest-${Date.now()}`,
    });
    testUserId = user.id;

    const session = await UserRepository.createSession(testUserId);
    sessionToken = session.sessionToken;
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.session.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  describe('Unauthenticated Access Controls', () => {
    it('should reject unauthenticated access to /api/auth/me with 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid session tokens with 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_session_token_12345');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('Authenticated Access & User Retrieval', () => {
    it('should return user profile for valid session token in Authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(testUserId);
    });

    it('should return user profile for valid session token in cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`mailflow_session=${sessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(testUserId);
    });
  });

  describe('Logout & Session Destruction', () => {
    it('should log out successfully and invalidate session', async () => {
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Verify token is invalidated
      const verifyRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(verifyRes.status).toBe(401);
    });
  });
});
