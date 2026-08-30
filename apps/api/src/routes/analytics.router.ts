import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { AnalyticsRepository } from '../repositories/analytics.repository';

export const analyticsRouter = Router();

// Apply session authentication middleware to all analytics routes
analyticsRouter.use(requireAuth);

// GET /api/analytics/overview - Platform level analytics summary
analyticsRouter.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const metrics = await AnalyticsRepository.getOverviewMetrics(userId);
    return res.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics metrics';
    return res.status(500).json({ error: message });
  }
});

// GET /api/analytics/campaigns/:id - Detailed analytics for specific campaign
analyticsRouter.get('/campaigns/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const analytics = await AnalyticsRepository.getCampaignAnalytics(req.params.id, userId);
    return res.json(analytics);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign analytics';
    return res.status(404).json({ error: message });
  }
});
