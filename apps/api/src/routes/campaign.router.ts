import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { CampaignRepository } from '../repositories/campaign.repository';
import { CampaignStatus } from '@prisma/client';
import { z } from 'zod';

const router = Router();

// Apply session authentication middleware to all campaign routes
router.use(requireAuth);

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  senderId: z.string().optional(),
  scheduledAt: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
});

const updateCampaignSchema = createCampaignSchema.partial();

const recipientSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  customData: z.record(z.unknown()).optional(),
});

const bulkRecipientsSchema = z.object({
  recipients: z.array(recipientSchema).min(1, 'At least one recipient is required'),
});

// POST /api/campaigns - Create campaign draft
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = createCampaignSchema.parse(req.body);
    const campaign = await CampaignRepository.createCampaign({
      userId,
      ...body,
    });
    return res.status(201).json(campaign);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request data';
    return res.status(400).json({ error: message });
  }
});

// GET /api/campaigns - List user's campaigns
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = req.query.status as CampaignStatus | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await CampaignRepository.listByUser(userId, { status, limit, offset });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list campaigns';
    return res.status(500).json({ error: message });
  }
});

// GET /api/campaigns/:id - Get campaign details
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const campaign = await CampaignRepository.findById(req.params.id, userId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found or access denied' });
    }

    return res.json(campaign);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign';
    return res.status(500).json({ error: message });
  }
});

// PUT /api/campaigns/:id - Update campaign content
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const data = updateCampaignSchema.parse(req.body);
    const updated = await CampaignRepository.updateCampaign(req.params.id, userId, data);
    return res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update campaign';
    return res.status(400).json({ error: message });
  }
});

// DELETE /api/campaigns/:id - Delete campaign
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await CampaignRepository.deleteCampaign(req.params.id, userId);
    return res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete campaign';
    return res.status(400).json({ error: message });
  }
});

// POST /api/campaigns/:id/recipients - Bulk set recipients
router.post('/:id/recipients', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { recipients } = bulkRecipientsSchema.parse(req.body);
    const createdRecipients = await CampaignRepository.setRecipients(req.params.id, userId, recipients);
    return res.json({ success: true, count: createdRecipients.length, recipients: createdRecipients });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add recipients';
    return res.status(400).json({ error: message });
  }
});

// POST /api/campaigns/:id/schedule - Schedule campaign
router.post('/:id/schedule', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { scheduledAt } = z
      .object({ scheduledAt: z.string().transform((val) => new Date(val)) })
      .parse(req.body);

    if (scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    const updated = await CampaignRepository.updateCampaign(req.params.id, userId, { scheduledAt });
    return res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to schedule campaign';
    return res.status(400).json({ error: message });
  }
});

// POST /api/campaigns/:id/launch - Launch campaign immediately
router.post('/:id/launch', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const launched = await CampaignRepository.launchCampaign(req.params.id, userId);
    return res.status(202).json({
      message: 'Campaign launch initiated successfully',
      campaign: launched,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch campaign';
    return res.status(400).json({ error: message });
  }
});

// POST /api/campaigns/:id/cancel - Cancel campaign
router.post('/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const campaign = await CampaignRepository.findById(req.params.id, userId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or access denied' });

    const updated = await CampaignRepository.updateStatus(req.params.id, CampaignStatus.CANCELLED);
    return res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel campaign';
    return res.status(400).json({ error: message });
  }
});

export const campaignRouter = router;
