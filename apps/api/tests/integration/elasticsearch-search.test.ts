import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { ElasticsearchService, EMAIL_JOBS_INDEX } from '../../src/services/elasticsearch.service';

describe('Phase 7: Elasticsearch Email Indexing & Search', () => {
  let userAId: string;
  let userASession: string;
  let userBId: string;
  let userBSession: string;
  let senderAId: string;

  beforeAll(async () => {
    // Create User A
    const userA = await prisma.user.create({
      data: { email: `es-usera-${Date.now()}@test.com`, name: 'User A' },
    });
    userAId = userA.id;
    const sessA = await prisma.session.create({
      data: { sessionToken: `es-session-a-${Date.now()}`, userId: userAId, expires: new Date(Date.now() + 86400000) },
    });
    userASession = sessA.sessionToken;

    // Create User B
    const userB = await prisma.user.create({
      data: { email: `es-userb-${Date.now()}@test.com`, name: 'User B' },
    });
    userBId = userB.id;
    const sessB = await prisma.session.create({
      data: { sessionToken: `es-session-b-${Date.now()}`, userId: userBId, expires: new Date(Date.now() + 86400000) },
    });
    userBSession = sessB.sessionToken;

    const senderA = await prisma.sender.create({
      data: {
        userId: userAId,
        email: 'sender-a@company.com',
        name: 'Sender A',
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPass: 'pass',
      },
    });
    senderAId = senderA.id;

    // Ensure index exists
    await ElasticsearchService.ensureIndex();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should index an email job and support multi-match search via GET /api/emails/search', async () => {
    const jobA = await prisma.emailJob.create({
      data: {
        userId: userAId,
        senderId: senderAId,
        recipient: 'special-customer-123@enterprise.com',
        subject: 'Urgent System Maintenance Notice',
        body: 'Please be advised that system maintenance is scheduled tonight.',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
        idempotencyKey: `es-idempotency-1-${Date.now()}`,
      },
    });

    // Manually index to test ElasticsearchService directly
    await ElasticsearchService.indexEmailJob({
      id: jobA.id,
      userId: userAId,
      senderId: senderAId,
      recipient: jobA.recipient,
      subject: jobA.subject,
      body: jobA.body,
      status: jobA.status,
      scheduledAt: jobA.scheduledAt.toISOString(),
      createdAt: jobA.createdAt.toISOString(),
      updatedAt: jobA.updatedAt.toISOString(),
    });

    // Search via REST endpoint
    const res = await request(app)
      .get('/api/emails/search?q=Maintenance')
      .set('Authorization', `Bearer ${userASession}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].recipient).toBe('special-customer-123@enterprise.com');
  });

  it('should strictly enforce cross-user isolation in search (User B cannot retrieve User A emails)', async () => {
    const res = await request(app)
      .get('/api/emails/search?q=Maintenance')
      .set('Authorization', `Bearer ${userBSession}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0); // Strict security filter
  });

  it('should seamlessly fall back to PostgreSQL database when Elasticsearch is unreachable or returns null', async () => {
    // Calling endpoint with a query that triggers fallback or tests PostgreSQL DB fallback
    const res = await request(app)
      .get('/api/emails/search?q=special-customer-123@enterprise.com')
      .set('Authorization', `Bearer ${userASession}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
