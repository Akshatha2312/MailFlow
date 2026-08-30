# MailFlow - Reliable Email Job Scheduling & Delivery Engine

MailFlow is a TypeScript-based email campaign platform for reliable scheduling, queue-backed processing, recipient personalization, and delivery tracking. It is implemented as an npm-workspaces monorepo with a Next.js frontend, an Express API, a dedicated BullMQ worker, and shared domain utilities.

## Overview

MailFlow supports authenticated users creating campaigns, selecting a sender, entering or importing recipients, previewing personalized content, and launching immediately or for a future time. The API persists campaign and email-job state in PostgreSQL through Prisma, places delivery work on Redis-backed BullMQ queues, and delegates delivery to a worker process.

The system also provides paginated email-job views, campaign and platform analytics, user-scoped Elasticsearch search with PostgreSQL fallback, Google sign-in, optional Slack OAuth notifications, Swagger documentation, and a protected Bull Board queue dashboard.

## Features

- Google OAuth sign-in with PostgreSQL-backed seven-day sessions and an HttpOnly `mailflow_session` cookie.
- User-scoped campaign creation, listing, editing, scheduling, launching, cancellation, and deletion.
- Campaign states: `DRAFT`, `SCHEDULED`, `QUEUED`, `SENDING`, `COMPLETED`, `CANCELLED`, and `FAILED`.
- Manual recipient entry with one recipient per line: `email, firstName, lastName, company`.
- Client-side campaign CSV upload with header support, quoted fields, whitespace trimming, empty-row handling, invalid-email reporting, and duplicate-email filtering.
- Recipient preview and template personalization using `{{firstName}}`, `{{lastName}}`, `{{company}}`, `{{email}}`, and matching custom-data keys.
- Automatic default sender provisioning during Google-user upsert and user-scoped sender selection.
- Immediate and delayed campaign launches through BullMQ.
- Dedicated worker concurrency, retry/backoff configuration, persistent email-job records, and delivery-attempt history.
- Per-sender hourly rate limiting backed by Redis atomic operations, with deferred jobs rescheduled for the next window.
- Nodemailer SMTP delivery with Ethereal-compatible test configuration and a mock provider for tests/load testing.
- Paginated email-job listing, status/date/recipient/subject filtering, detail views, and client-side dashboard search.
- Elasticsearch indexing and user-filtered email search with PostgreSQL fallback when Elasticsearch is unavailable.
- Platform and campaign analytics for campaign counts, recipients, queued/sent/failed jobs, delivery rates, recipient breakdowns, and recent attempts.
- Optional Slack OAuth connection, status/disconnect controls, and rate-limit webhook notifications.
- Protected Swagger UI at `/api-docs` and Bull Board at `/admin/queues`.
- Responsive Next.js frontend with campaign, dashboard, analytics, contacts, login, and campaign-detail views.

## Architecture

```text
Next.js web app
        |
        | authenticated HTTP requests (session cookie)
        v
Express API ----------------------> PostgreSQL via Prisma
        |                                    |
        | create delayed jobs                 | campaigns, recipients,
        v                                    | users, senders, email jobs,
Redis <------ BullMQ Queue                  | attempts, sessions, Slack
        |
        v
Dedicated email worker
        |
        +--> Redis rate-limit counters
        +--> SMTP/Ethereal or mock provider
        +--> PostgreSQL status and attempt updates
        +--> Slack webhook notification (when configured)

Email-job indexing/search <------> Elasticsearch
```

### Components

- **Frontend:** `apps/web` provides the user interface and a typed `apiClient`. Campaign CSV parsing occurs in the browser; no local filesystem path is sent to the server.
- **API:** `apps/api` authenticates requests, validates input, applies user ownership checks, manages campaigns and email jobs, and exposes analytics and integration routes.
- **Database:** PostgreSQL is the durable source of truth for users, sessions, senders, campaigns, recipients, email jobs, attempts, and Slack connections.
- **Queue:** BullMQ uses Redis for delayed job scheduling and queue state.
- **Worker:** `workers/email-worker` consumes jobs, checks idempotency and rate limits, sends or simulates delivery, and persists results.
- **Shared package:** `packages/shared` contains environment validation, domain types/state transitions, personalization, logging, Slack notifications, and shared exports.
- **Search:** `apps/api/src/services/elasticsearch.service.ts` indexes email jobs and executes user-scoped searches, with a PostgreSQL fallback.

## Technology Stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Lucide Icons |
| Backend | Node.js, Express, TypeScript, Zod |
| Persistence | PostgreSQL 16, Prisma ORM |
| Queueing | BullMQ 5, Redis 7, ioredis |
| Email | Nodemailer SMTP, Ethereal test SMTP, mock provider for tests |
| Search | Elasticsearch 8.12 client |
| Authentication | Google OAuth 2.0-style authorization flow, cookie sessions |
| Integrations | Slack OAuth v2 and incoming webhooks |
| API tooling | Swagger UI, Bull Board |
| Local infrastructure | Docker Compose |
| Production hosting | Frontend on Vercel and backend service on Render; configuration is external to this repository |

## Repository Structure

```text
MailFlow/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── config/          # Prisma, Redis, queue, Elasticsearch, Swagger
│   │   │   ├── middleware/      # Authentication and error middleware
│   │   │   ├── repositories/    # Persistence and domain operations
│   │   │   ├── routes/          # Express API routes
│   │   │   ├── app.ts           # Express application and route mounting
│   │   │   └── server.ts        # Database/Redis startup and HTTP listener
│   │   └── tests/               # Unit, integration, and security tests
│   └── web/
│       └── src/
│           ├── app/             # Next.js pages and workflows
│           ├── components/      # Shared UI components
│           └── lib/             # API client and CSV utilities
├── packages/shared/             # Shared types, validation, utilities, services
├── workers/email-worker/         # BullMQ worker, provider, and rate-limit code
├── prisma/                      # Prisma schema and migration files
├── docker/                      # API, worker, and web Dockerfiles
├── scripts/load-test.ts         # Direct worker processing/load script
├── docker-compose.yml            # Local PostgreSQL, Redis, Elasticsearch, API, worker, web
├── package.json                 # Root workspace scripts
└── package-lock.json
```

## Core Workflow

1. A user signs in through Google OAuth. The API upserts the user and Google account, ensures a default sender, and creates a database session.
2. The user creates a campaign and enters recipients manually or imports a CSV. Campaign CSV rows are converted to the same recipient objects used by manual entry.
3. The user composes a subject and HTML body containing supported personalization placeholders.
4. The frontend previews the subject and body for each parsed recipient.
5. Saving creates a draft. Launching immediately or scheduling a future time creates campaign-linked `EmailJob` records and BullMQ jobs with the appropriate delay.
6. The worker loads each persisted job, skips jobs already marked `SENT`, checks the sender’s hourly limit, applies the configured minimum delay, and delivers through the selected provider.
7. Successes and failures update email-job, attempt, recipient, and campaign records. Campaign analytics read those persisted records.
8. Email jobs are indexed asynchronously for user-scoped search when Elasticsearch is available.

## Recipient Management

### Manual entry

The campaign form accepts one recipient per line:

```text
alice@example.com, Alice, Smith, Acme Corp
bob@example.com, Bob, Jones, Globex
```

The existing frontend parser also accepts comma, semicolon, or tab-separated values. Manual editing remains available after a CSV import.

### Campaign CSV import

The campaign form accepts `.csv` files through a browser file picker. Supported columns are `email`, `firstName`/`firstname`, `lastName`/`lastname`, and `company`, matched case-insensitively. Quoted CSV fields are supported.

```csv
email,firstName,lastName,company
alice@example.com,Alice,Smith,Acme Corp
bob@example.com,Bob,Jones,Globex
```

The uploaded file is read in the browser and appended to the existing textarea data. Empty rows are ignored, valid email addresses are retained, malformed email rows are reported, and duplicate email addresses are filtered case-insensitively. The combined data is then parsed by the existing campaign recipient flow and passed to the existing campaign API.

### Contacts page import

The Contacts & Senders page has an Import CSV Contacts modal with the same browser-side file picker and reviewable textarea. Importing updates the current in-memory audience table; there is no contacts persistence API in the current implementation.

## Personalization

Subject lines and HTML bodies use double-brace placeholders:

```html
<p>Hello {{firstName}} {{lastName}},</p>
<p>We prepared this offer for {{company}}.</p>
```

The shared renderer replaces `{{firstName}}`, `{{lastName}}`, `{{company}}`, and `{{email}}`. Other placeholders can resolve values from a recipient’s `customData` object. Unknown values resolve to an empty string in the shared renderer.

## Campaign Lifecycle

The Prisma enum and shared transition logic define these campaign states:

```text
DRAFT -> SCHEDULED
DRAFT -> QUEUED / SENDING / CANCELLED
SCHEDULED -> QUEUED / SENDING / CANCELLED
QUEUED -> SENDING / CANCELLED / FAILED
SENDING -> COMPLETED / FAILED / CANCELLED
```

The implementation also defines `COMPLETED` and `FAILED` as terminal outcomes. Campaign launch currently persists `SENDING` directly while the `QUEUED` state remains part of the domain model for queue-related status reporting.

Email jobs use `SCHEDULED`, `PROCESSING`, `SENT`, `FAILED`, and `CANCELLED`. Campaign recipients use `PENDING`, `SENT`, `FAILED`, and `CANCELLED`.

## Email Delivery and Reliability

Sender records contain SMTP host, port, username, password, email, default status, and hourly limit. The worker uses Nodemailer for configured non-Ethereal SMTP senders. Ethereal is a test SMTP service; the current worker treats senders using `smtp.ethereal.email` as synthetic successful test delivery rather than ordinary production delivery.

BullMQ default job options include three attempts with exponential backoff. Persisted idempotency keys prevent duplicate scheduling records, and the worker skips an email job already marked `SENT`. Delivery attempts are stored in PostgreSQL with success response codes or failure details.

The worker enforces a minimum inter-send delay and per-sender hourly limits. Redis Lua operations provide atomic counters when Redis is available; jobs exceeding a limit are deferred to the next hourly window. A PostgreSQL fallback exists for rate-limit tracking when Redis is unavailable, although it does not provide the same concurrency guarantees as the Redis path.

## Analytics

Authenticated analytics endpoints provide:

- total, active, completed, draft, and cancelled campaigns;
- total campaign recipients;
- queued, sent, and failed email-job counts;
- overall delivery rate;
- per-campaign recipient totals, sent/failed counts, and delivery rate;
- campaign recipient status breakdown; and
- recent delivery attempt history.

## API Surface

All routes below are mounted by the Express API. Protected routes require the authenticated session unless noted otherwise.

| Area | Routes |
| --- | --- |
| Health | `GET /health`, `GET /health/detailed` |
| Base/API docs | `GET /api`, `/api-docs`, `/api-docs/swagger.json` |
| Authentication | `GET /api/auth/google`, `GET /api/auth/google/callback`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Email jobs | `POST /api/emails/schedule`, `GET /api/emails`, `GET /api/emails/:id`, `GET /api/emails/search` |
| Campaigns | `POST /api/campaigns`, `GET /api/campaigns`, `GET /api/campaigns/:id`, `PUT /api/campaigns/:id`, `DELETE /api/campaigns/:id` |
| Campaign actions | `POST /api/campaigns/:id/recipients`, `/schedule`, `/launch`, `/cancel` |
| Analytics | `GET /api/analytics/overview`, `GET /api/analytics/campaigns/:id` |
| Senders | `GET /api/senders` |
| Slack | `GET /api/integrations/slack/connect`, `/callback`, `/status`; `POST /api/integrations/slack/disconnect` |

## Database

PostgreSQL is accessed through Prisma. The current schema includes:

- `User`, `OAuthAccount`, and `Session` for identity and sessions;
- `Sender` for user-owned SMTP configuration;
- `Campaign` and `CampaignRecipient` for campaign composition and recipient state;
- `EmailJob` and `EmailDeliveryAttempt` for durable delivery state and history;
- `RateLimitWindow` for persisted hourly counters; and
- `SlackConnection` for optional Slack integration data.

The checked-in Prisma migration should be reviewed against the current schema before production rollout. Docker images generate the Prisma client but do not automatically run migrations; apply the appropriate migration procedure separately for the target database.

## Redis and BullMQ

Redis stores BullMQ queue state and delayed jobs. The API creates jobs in the `email-delivery-queue`; the dedicated worker consumes that queue with configurable concurrency. Redis also supports atomic per-sender rate-limit counters and deduplicated Slack rate-limit alerts.

The application supports either `REDIS_URL` or the local `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` configuration. A `rediss://` URL enables TLS options.

## Elasticsearch

`ElasticsearchService` maintains the `mailflow_emails` index for email-job documents and performs user-filtered multi-match searches across recipient, subject, and body fields. The email search endpoint falls back to PostgreSQL when Elasticsearch is unavailable. Elasticsearch index creation is available through the service, but API startup does not automatically create the index.

## Authentication and Integrations

Google authentication is implemented by the API’s OAuth routes and persists OAuth account/session records. Google client credentials and callback URLs must be configured for login to work. The current flow uses a random state value, but it does not implement a full PKCE exchange; production deployments should review the OAuth hardening requirements for their identity provider.

Slack is optional. When configured, users can connect a Slack workspace through OAuth. The API stores the connection server-side, does not return access tokens in status responses, and can send rate-limit notifications through an incoming webhook.

## Environment Variables

Use placeholders for secrets and keep `.env` files out of source control.

| Variable | Purpose | Default or notes |
| --- | --- | --- |
| `PORT` | API HTTP port | `4000` |
| `NODE_ENV` | Runtime mode | `development` |
| `FRONTEND_URL` | Credentialed CORS origin and OAuth redirects | `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL connection string | Local PostgreSQL default is supplied |
| `REDIS_URL` | Redis connection URL | Optional alternative to host/port variables |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | Optional |
| `ELASTICSEARCH_NODE` | Elasticsearch URL | `http://localhost:9200` |
| `ETHEREAL_HOST` | Ethereal/SMTP hostname | Optional; defaults to Ethereal host in provider code |
| `ETHEREAL_PORT` | Ethereal/SMTP port | Optional; defaults to `587` |
| `ETHEREAL_USER` | SMTP/Ethereal username | Secret; optional for generated Ethereal test accounts |
| `ETHEREAL_PASS` | SMTP/Ethereal password | Secret; optional for generated Ethereal test accounts |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Required for Google login |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Required for Google login |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL | Required for deployed OAuth configuration |
| `BACKEND_URL` | Backend URL used by OAuth code | Set to the deployed API origin when required |
| `SLACK_CLIENT_ID` | Slack OAuth client ID | Optional integration |
| `SLACK_CLIENT_SECRET` | Slack OAuth client secret | Optional integration |
| `SLACK_REDIRECT_URI` | Slack OAuth callback URL | Optional integration |
| `SESSION_SECRET` | Reserved session configuration value | Strong production value recommended |
| `WORKER_CONCURRENCY` | Worker concurrency | `5` |
| `MIN_EMAIL_DELAY_MS` | Minimum provider delay | `200` milliseconds |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Fallback hourly limit | `100` |
| `EMAIL_PROVIDER` | Provider strategy | `smtp`; `mock` is supported for tests/load scripts |
| `NEXT_PUBLIC_API_URL` | Frontend API base URL | `http://localhost:4000/api`; production includes `/api` |

Example safe placeholders:

```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
REDIS_URL=redis://<host>:6379
ELASTICSEARCH_NODE=http://localhost:9200
ETHEREAL_USER=<your-ethereal-username>
ETHEREAL_PASS=<your-ethereal-password>
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
SESSION_SECRET=<strong-random-secret>
```

## Local Development

### Prerequisites

- Node.js 20 or a compatible current Node.js release
- npm with workspace support
- Docker Desktop for PostgreSQL, Redis, and Elasticsearch

### Setup

```bash
git clone https://github.com/Akshatha2312/MailFlow.git
cd MailFlow
npm install
```

Create a root `.env` using the variables above. Do not commit credentials.

Start local infrastructure:

```bash
docker compose up -d
```

Generate Prisma Client and apply the appropriate development migration:

```bash
npm run db:generate
npx prisma migrate dev
```

Start the processes in separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

The default local URLs are:

- Web app: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger UI: `http://localhost:4000/api-docs`
- Bull Board: `http://localhost:4000/admin/queues`
- Elasticsearch: `http://localhost:9200`

Stop local infrastructure with:

```bash
docker compose down
```

## Build, Typecheck, Lint, and Tests

Root workspace commands:

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```

Focused commands:

```bash
npm run build -w packages/shared
npm run build -w apps/api
npm run build -w apps/web
npm run test -w apps/api
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/load-test.ts
```

The Jest suite is concentrated in `apps/api/tests` and includes unit, integration, and security coverage for authentication, campaigns, providers, personalization, queue processing, rate limiting, Elasticsearch behavior, analytics, Slack behavior, persistence, and authorization. Integration tests require the configured local services. The load test uses the worker processor directly and is not a benchmark of a separately deployed worker fleet. Keep test totals and performance numbers tied to the result of the current run rather than treating historical project-status figures as guarantees.

## Deployment

MailFlow is deployed as separate frontend and backend services:

- **Frontend:** Vercel hosts `apps/web`.
- **Backend:** Render runs the compiled API from `apps/api`.

For the Render API service, the working directory is `apps/api`. The API package build script is `tsc`, and the compiled entrypoint is `dist/server.js`; the start command is:

```bash
node dist/server.js
```

The server listens on the platform-provided `PORT`. The API deployment must provide PostgreSQL, Redis, OAuth, CORS, and SMTP configuration through the platform’s environment-variable settings. For Render Redis, use `REDIS_URL` in the form `redis://<host>:6379` or a TLS `rediss://` URL when provided.

For Vercel, set:

```env
NEXT_PUBLIC_API_URL=https://<deployed-api-host>/api
```

The `/api` suffix is required because API routes are mounted under `/api`; the health endpoint is the root `/health` endpoint and the frontend derives that origin for its status check. Configure `FRONTEND_URL` on Render to the Vercel origin and configure Google/Slack callback URLs to the deployed API routes.

The Dockerfiles provide alternative container builds for the API, worker, and web app. The API and worker images build the shared package first, generate Prisma Client, and then compile their respective applications. Database migrations are not run automatically by the images.

## Demonstration Guide

1. Open the web app and sign in with Google.
2. Confirm the automatically provisioned default sender is selected.
3. Open campaign creation and enter a campaign name.
4. Compose a subject and HTML body using personalization placeholders.
5. In recipient selection, type recipients manually or use **Upload CSV** to import them into the editable recipient field.
6. Review the parsed recipient list and cycle through the live personalization preview.
7. Save a draft, schedule it for a future time, or launch it immediately.
8. Open the campaigns and dashboard views to observe campaign and email-job statuses.
9. Open analytics to review delivery counts, rates, recipient breakdowns, and attempt history.
10. Use search, Swagger UI, or the protected Bull Board dashboard when evaluating the supporting API and queue behavior.

## Limitations and Notes

- Ethereal is a test SMTP service and should not be treated as a production mailbox provider.
- Google OAuth, Slack OAuth, PostgreSQL, Redis, Elasticsearch, and SMTP credentials require external setup.
- Contacts imported on the Contacts page are held in browser memory and are not persisted through a contacts API.
- Elasticsearch index creation is not automatically invoked at API startup.
- Campaign launch creates database jobs before enqueueing BullMQ jobs; an enqueue failure can require operational recovery.
- Campaign cancellation does not currently remove already-created BullMQ jobs.
- The checked-in migration and current Prisma schema should be reconciled before applying migrations to a new production database.
- Integration tests require running infrastructure and may leave open handles when worker/queue resources are active.

## Future Enhancements

Potential future work, not current functionality, includes:

- production SMTP provider integrations and verified-domain management;
- persistent contact/audience storage and segmentation;
- richer campaign templates and template versioning;
- unsubscribe and suppression-list workflows;
- webhook-based delivery events;
- automatic Elasticsearch index provisioning;
- stronger OAuth PKCE/state handling and session-secret integration; and
- horizontal worker scaling with operational queue observability.

## Security Considerations

- Never commit `.env` files, SMTP passwords, OAuth secrets, database credentials, Redis credentials, or session secrets.
- Use HTTPS for deployed frontend, API, OAuth callback, and integration URLs.
- Configure a strong random production session secret and rotate external credentials according to provider policy.
- Keep `FRONTEND_URL` restricted to the intended frontend origin when using credentialed CORS.
- Validate uploaded CSV content and review invalid rows before importing or launching a campaign.
- Preserve user-scoped authorization checks when adding routes or repository operations.
- Monitor Redis, PostgreSQL, Elasticsearch, worker retries, and SMTP provider limits in production.

## Project Information

- Repository: [Akshatha2312/MailFlow](https://github.com/Akshatha2312/MailFlow)
- Project: ReachInbox software development / internship assignment
