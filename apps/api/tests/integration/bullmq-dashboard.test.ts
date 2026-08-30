import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';

describe('Phase 8: Live BullMQ Monitoring Dashboard (/admin/queues)', () => {
  let userId: string;
  let sessionToken: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `bullboard-user-${Date.now()}@test.com`,
        name: 'Bull Board Tester',
      },
    });
    userId = user.id;

    const session = await prisma.session.create({
      data: {
        sessionToken: `bullboard-session-${Date.now()}`,
        userId,
        expires: new Date(Date.now() + 86400000),
      },
    });
    sessionToken = session.sessionToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should reject unauthenticated requests to /admin/queues with HTTP 401', async () => {
    const res = await request(app).get('/admin/queues');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('should allow authenticated users to access live BullMQ monitoring dashboard UI at /admin/queues', async () => {
    const res = await request(app)
      .get('/admin/queues/')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect([200, 302]).toContain(res.status);
    if (res.status === 200) {
      expect(res.text).toContain('<html');
    }
  });
});
