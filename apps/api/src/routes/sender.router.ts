import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { SenderRepository } from '../repositories/sender.repository';

export const senderRouter = Router();

// Apply session authentication middleware to all sender routes
senderRouter.use(requireAuth);

/**
 * GET /api/senders
 * Returns all senders belonging exclusively to the authenticated user (secrets excluded)
 */
senderRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const senders = await SenderRepository.findByUserId(userId);

    // Sanitize response to exclude smtpPass
    const sanitizedSenders = senders.map(({ smtpPass, ...rest }) => rest);

    return res.json(sanitizedSenders);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve senders', code: 'FETCH_ERROR' });
  }
});
