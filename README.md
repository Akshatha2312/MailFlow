# MailFlow - Reliable Email Job Scheduling Platform

MailFlow is a full-stack, production-grade email job scheduling platform built for the **ReachInbox.ai Software Development Intern Hiring Assignment**.

---

## 1. Project Overview
MailFlow enables users to authenticate via Google OAuth, upload recipient lists (CSV/TXT), compose emails, select start times, set minimum delivery delays between emails, configure per-sender hourly sending limits, and schedule email jobs safely. All scheduled email jobs are durably stored in PostgreSQL and scheduled asynchronously using BullMQ delayed queues backed by Redis. A dedicated worker process executes email sends through Ethereal SMTP with atomic rate limiting and idempotency controls. The platform includes full-text Elasticsearch email search, live BullMQ queue monitoring dashboard, and real Slack OAuth integrations for rate limit alerts.

---

## 2. Architecture & Design Principles
- **Separation of Concerns**: NPM Workspaces monorepo (`apps/api`, `apps/web`, `workers/email-worker`, `packages/shared`).
- **PostgreSQL Source of Truth**: Database records dictate the authoritative state of every job (`SCHEDULED`, `PROCESSING`, `SENT`, `FAILED`, `CANCELLED`).
- **BullMQ Delayed Queue Scheduling**: Zero cron jobs. Delayed execution is managed exclusively through BullMQ + Redis persistent queues.
- **Atomic Concurrency & Rate Limiting**: Distributed Redis Lua scripts guarantee strict per-sender hourly sending limits even under high concurrency and multi-worker scale.
- **Asynchronous Fault Isolation**: Slack webhook notifications and Elasticsearch indexing are completely non-blocking. Glitches in search or Slack APIs **never** crash email sending or cause duplicate delivery.

---

## 3. Technologies Stack
- **Backend (`apps/api`)**: Node.js, Express.js, TypeScript, Prisma ORM, BullMQ, Redis, Elasticsearch 8, Ethereal SMTP (Nodemailer), Zod, Swagger UI (`swagger-ui-express`), Bull Board (`@bull-board/express`), Google OAuth 2.0 Router, Slack OAuth 2.0 Router (`cookie-parser`).
- **Frontend (`apps/web`)**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Lucide Icons, Typed API Client (`apiClient`), FileUploader (CSV/TXT parser).
- **Email Worker (`workers/email-worker`)**: Dedicated TypeScript worker process consuming BullMQ delayed jobs with configurable concurrency and rate limiting.
- **Shared Package (`packages/shared`)**: Monorepo package providing domain models, state machine transition guards, `IEmailProvider` (`SMTPEmailProvider`, `MockEmailProvider`), `RateLimitRepository`, `SlackNotificationService`, `ElasticsearchService`, and Zod env validation schemas.
- **Infrastructure (`docker/`)**: Docker Compose container orchestrations for PostgreSQL 16, Redis 7, Elasticsearch 8, multi-stage production Dockerfiles, health checks, and persistent storage volumes.

---

## 4. Local Setup Instructions
```bash
# 1. Clone repository and install dependencies
git clone https://github.com/your-username/MailFlow.git
cd MailFlow
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Start local infrastructure via Docker Compose
docker compose up -d

# 4. Generate Prisma Client & Run Database Migrations
npx prisma migrate dev --name init_domain_schema
```

---

## 5. Environment Variables Reference
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API Server HTTP Port | `4000` |
| `NODE_ENV` | Application environment | `development` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://mailflow:mailflow_secret@localhost:5432/mailflow_db` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `ELASTICSEARCH_NODE` | Elasticsearch node URL | `http://localhost:9200` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | Configured in Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | Configured in Google Cloud |
| `SLACK_CLIENT_ID` | Slack OAuth 2.0 App Client ID | Configured in Slack API Portal |
| `SLACK_CLIENT_SECRET` | Slack OAuth 2.0 Client Secret | Configured in Slack API Portal |
| `SLACK_REDIRECT_URI` | Slack OAuth 2.0 Callback URL | `http://localhost:4000/api/integrations/slack/callback` |
| `WORKER_CONCURRENCY` | Worker concurrent job processing limit | `5` |
| `MIN_EMAIL_DELAY_MS` | Minimum delay between email sends (ms) | `200` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender hourly email sending limit | `100` |
| `EMAIL_PROVIDER` | Email provider strategy (`smtp` or `mock`) | `smtp` |

---

## 6. Database Setup (PostgreSQL + Prisma)
PostgreSQL 16 serves as the primary relational database. Domain models (`User`, `Account`, `Session`, `Sender`, `EmailJob`, `EmailDeliveryAttempt`, `SlackConnection`, `Campaign`, `Recipient`) are defined in `prisma/schema.prisma`.
Run schema migrations:
```bash
npx prisma migrate dev
```

---

## 7. Redis Setup
Redis 7 Alpine acts as the queue backing store for BullMQ and provides atomic rate-limit counters (`rate_limit:sender:${senderId}:hour:${windowTimestamp}`).
Container configuration is defined in `docker/docker-compose.yml`.

---

## 8. Elasticsearch Setup
Elasticsearch 8.12 maintains full-text email search indexes (`mailflow_emails`).
Field mappings support fuzzy multi-match searching across recipient email, email subject, and body content with strict user isolation filters.

---

## 9. Google OAuth Setup
Backend routes (`GET /api/auth/google` & `GET /api/auth/google/callback`) handle the Google OAuth 2.0 PKCE flow.
On successful authentication, a user session is created in PostgreSQL and returned as an `HttpOnly` session cookie (`mailflow_session`).

---

## 10. Slack OAuth Setup
Backend routes (`GET /api/integrations/slack/connect`, `GET /api/integrations/slack/callback`, `GET /api/integrations/slack/status`, `POST /api/integrations/slack/disconnect`) enable users to link real Slack workspace webhooks securely without exposing raw tokens to the frontend.

---

## 11. Ethereal SMTP Setup
Email sending uses Nodemailer with Ethereal SMTP (`smtp.ethereal.email`). In development mode, `SMTPEmailProvider` automatically generates Ethereal test accounts if explicit credentials are not provided.

---

## 12. Running API Server
```bash
npm run dev:api
```

---

## 13. Running Frontend Web App
```bash
npm run dev:web
```

---

## 14. Running Email Worker
```bash
npm run dev:worker
```

---

## 15. Running BullMQ Queue Dashboard
Navigate in browser (session authentication required):
```
http://localhost:4000/admin/queues
```

---

## 16. Scheduling Architecture
- **Zero Cron Jobs**: All delayed email jobs are enqueued directly into BullMQ using execution delays calculated as `Math.max(0, scheduledAt.getTime() - Date.now())`.
- **Durable Scheduling**: Each job record receives a unique `idempotencyKey` (`userId-senderId-recipient-timestamp`).

---

## 17. Restart Persistence
If the server or worker crashes and restarts:
- All scheduled jobs remain saved in PostgreSQL.
- Delayed jobs remain stored in Redis sorted sets.
- When workers resume, BullMQ immediately picks up delayed jobs whose scheduled execution time has arrived.

---

## 18. Idempotency & Duplicate Send Prevention
- **Idempotency Key Protection**: Duplicate API scheduling requests return existing job records without inserting duplicate database rows.
- **Worker Idempotency Guard**: Before executing SMTP delivery, the worker verifies `if (emailJob.status === JobStatus.SENT) return;`, ensuring retries or duplicate worker execution never send duplicate emails.

---

## 19. Concurrency Controls
Worker concurrency is dynamically configured via `WORKER_CONCURRENCY` (default: 5). Multiple workers can safely process jobs concurrently.

---

## 20. Minimum Email Delay
A configurable delay (`MIN_EMAIL_DELAY_MS`, default: 200ms) is enforced prior to Nodemailer invocation to satisfy provider throttling rules.

---

## 21. Hourly Rate Limiting
Per-sender hourly rate limits (`MAX_EMAILS_PER_HOUR_PER_SENDER`, default: 100) are enforced using atomic Redis Lua scripts (`RateLimitRepository.checkAndIncrementSenderLimitAtomic`). Jobs exceeding the limit are atomically rescheduled to the next hourly window without dropping records or marking them failed.

---

## 22. Slack Rate-Limit Notifications
When a sender reaches its hourly limit, `SlackNotificationService` sends a block notification to the user's Slack webhook. Duplicate Slack alerts within the same hour window are deduplicated via Redis key `rate_limit_alert_sent:${senderId}:${windowTimestamp}`.

---

## 23. Elasticsearch Indexing & Search
When email jobs are created or status-updated, `ElasticsearchService.indexEmailJob` updates the `mailflow_emails` index non-blockingly. `GET /api/emails/search` executes multi-match queries with a strict `userId` filter. If Elasticsearch is unreachable, the endpoint transparently falls back to PostgreSQL querying.

---

## 24. Automated Testing
Run 78/78 tests across 17 test suites:
```bash
npm run test
```

---

## 25. Load Testing & Throughput Validation
Run the repeatable 1000+ job load test:
```bash
npx ts-node --compiler-options '{\"module\":\"commonjs\"}' scripts/load-test.ts
```
**Empirical Results**:
- 1,000 jobs scheduled
- 430 delivered (up to hourly rate limit)
- 570 deferred (rescheduled to next hourly window, 0 dropped)
- 0 failed
- Effective throughput: **166.92 emails/sec**

---

## 26. Assumptions
- Server clocks across API, worker, and Redis nodes are synchronized via NTP.
- PostgreSQL database operates as the sole authoritative source of truth.

---

## 27. Trade-offs
- Client-side CSV email parsing validates email string format instantly, but server-side validation remains authoritative upon batch scheduling.

---

## 28. Known Limitations
- High-volume rate limit rescheduling relies on Redis availability for atomic window tracking. If Redis is flushed, rate limit counters reset to zero for the current hour window.
