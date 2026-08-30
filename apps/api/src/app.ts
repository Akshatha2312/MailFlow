import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { healthRouter } from './routes/health.router';
import { campaignRouter } from './routes/campaign.router';
import { analyticsRouter } from './routes/analytics.router';
import { authRouter } from './routes/auth.router';
import { emailRouter } from './routes/email.router';
import { slackRouter } from './routes/slack.router';
import { senderRouter } from './routes/sender.router';
import { requireAuth } from './middleware/auth.middleware';
import { emailQueue } from './config/queue';
import { openApiSpec } from './config/swagger';
import { errorHandler } from './middleware/error.middleware';
import { validateEnv } from '@mailflow/shared';

const env = validateEnv();

export const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// BullMQ Monitoring Dashboard (Bull Board) Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

// Protect /admin/queues with session authentication middleware
app.use('/admin/queues', requireAuth, serverAdapter.getRouter());

// Swagger UI OpenAPI Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get('/api-docs/swagger.json', (_req, res) => res.json(openApiSpec));

// Health Check Router
app.use('/health', healthRouter);

// Authentication Router
app.use('/api/auth', authRouter);

// Email Scheduling Router
app.use('/api/emails', emailRouter);

// Campaign Management Router
app.use('/api/campaigns', campaignRouter);

// Campaign Analytics Router
app.use('/api/analytics', analyticsRouter);

// Slack OAuth Integrations Router
app.use('/api/integrations/slack', slackRouter);

// Sender Management Router
app.use('/api/senders', senderRouter);

// Base route
app.get('/api', (_req, res) => {
  res.json({
    name: 'MailFlow API',
    version: '1.0.0',
    phase: 'Phase 8 - Live BullMQ Queue Dashboard Complete',
    status: 'online',
    documentation: '/api-docs',
    queueDashboard: '/admin/queues',
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);
