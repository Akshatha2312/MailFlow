import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { EmailJobRepository } from '../repositories/email-job.repository';
import { JobStatus } from '@prisma/client';
import { ElasticsearchService } from '../services/elasticsearch.service';

export const emailRouter = Router();

// Apply auth middleware to all email routes
emailRouter.use(requireAuth);

/**
 * GET /api/emails/search
 * Full-text multi-match search endpoint using Elasticsearch with user isolation & PostgreSQL fallback
 */
emailRouter.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { q, query, status, page, limit } = req.query;
    const searchQuery = String(q || query || '');

    // Attempt Elasticsearch full-text search first
    const esResult = await ElasticsearchService.searchEmailJobs({
      userId,
      query: searchQuery,
      status: status ? String(status) : undefined,
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 20,
    });

    if (esResult) {
      return res.json(esResult);
    }

    // Fallback to PostgreSQL database query if Elasticsearch is offline / unavailable
    const pgResult = await EmailJobRepository.listEmailJobs({
      userId,
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 20,
      status: status ? (String(status).toUpperCase() as JobStatus) : undefined,
      recipient: searchQuery.includes('@') ? searchQuery : undefined,
      subject: !searchQuery.includes('@') ? searchQuery : undefined,
    });

    return res.json({
      data: pgResult.data,
      total: pgResult.pagination.total,
      page: pgResult.pagination.page,
      limit: pgResult.pagination.limit,
      fromElasticsearch: false,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to search email jobs', code: 'SEARCH_ERROR' });
  }
});

/**
 * POST /api/emails/schedule
 * Schedules email job batch with BullMQ delayed queue
 */
emailRouter.post('/schedule', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { subject, body, recipients, senderId, startTime, delaySeconds, idempotencyKeyPrefix } = req.body;

    if (!subject || !body || !recipients || !Array.isArray(recipients) || recipients.length === 0 || !senderId) {
      return res.status(400).json({
        error: 'Missing required parameters: subject, body, recipients (non-empty array), senderId',
        code: 'VALIDATION_ERROR',
      });
    }

    const parsedStartTime = startTime ? new Date(startTime) : undefined;
    const parsedDelay = delaySeconds ? parseInt(String(delaySeconds), 10) : 0;

    const result = await EmailJobRepository.scheduleBatch({
      userId,
      senderId,
      subject,
      body,
      recipients,
      startTime: parsedStartTime,
      delaySeconds: parsedDelay,
      idempotencyKeyPrefix,
    });

    return res.status(202).json({
      message: `Successfully scheduled ${result.scheduledCount} email jobs.`,
      scheduledCount: result.scheduledCount,
      jobs: result.jobs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to schedule emails';
    return res.status(400).json({ error: msg, code: 'SCHEDULING_ERROR' });
  }
});

/**
 * GET /api/emails
 * Paginated email jobs listing with status, recipient, and subject filters
 */
emailRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { page, limit, status, recipient, subject, dateFrom, dateTo } = req.query;

    const result = await EmailJobRepository.listEmailJobs({
      userId,
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 20,
      status: status ? (String(status).toUpperCase() as JobStatus) : undefined,
      recipient: recipient ? String(recipient) : undefined,
      subject: subject ? String(subject) : undefined,
      dateFrom: dateFrom ? new Date(String(dateFrom)) : undefined,
      dateTo: dateTo ? new Date(String(dateTo)) : undefined,
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve email jobs', code: 'FETCH_ERROR' });
  }
});

/**
 * GET /api/emails/:id
 * Get single email job detail with delivery attempt history
 */
emailRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const emailJob = await EmailJobRepository.getById(id, userId);

    if (!emailJob) {
      return res.status(404).json({ error: 'Email job not found or access denied', code: 'NOT_FOUND' });
    }

    return res.json(emailJob);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve email job details', code: 'FETCH_ERROR' });
  }
});
