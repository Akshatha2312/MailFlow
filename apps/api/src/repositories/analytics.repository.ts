import { prisma } from '../config/prisma';
import { CampaignStatus, RecipientStatus, JobStatus } from '@prisma/client';

export interface OverviewMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  draftCampaigns: number;
  cancelledCampaigns: number;
  totalRecipients: number;
  emailsQueued: number;
  emailsSent: number;
  emailsFailed: number;
  deliveryRate: number; // percentage 0 - 100
  campaigns: Array<{
    id: string;
    name: string;
    status: CampaignStatus;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    deliveryRate: number;
    createdAt: Date;
    completedAt: Date | null;
  }>;
}

export interface DetailedCampaignAnalytics {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  deliveryRate: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  recipientBreakdown: {
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
  };
  recentAttempts: Array<{
    id: string;
    recipient: string;
    status: string;
    responseCode: string | null;
    error: string | null;
    attemptedAt: Date;
  }>;
}

export class AnalyticsRepository {
  /**
   * Retrieves aggregated platform-level analytics metrics for a given user using PostgreSQL SQL aggregation queries.
   */
  static async getOverviewMetrics(userId: string): Promise<OverviewMetrics> {
    // 1. Fetch campaigns summary
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalCampaigns = campaigns.length;
    let activeCampaigns = 0;
    let completedCampaigns = 0;
    let draftCampaigns = 0;
    let cancelledCampaigns = 0;

    for (const c of campaigns) {
      if (c.status === CampaignStatus.QUEUED || c.status === CampaignStatus.SENDING) {
        activeCampaigns++;
      } else if (c.status === CampaignStatus.COMPLETED) {
        completedCampaigns++;
      } else if (c.status === CampaignStatus.DRAFT) {
        draftCampaigns++;
      } else if (c.status === CampaignStatus.CANCELLED) {
        cancelledCampaigns++;
      }
    }

    // 2. Aggregate EmailJob counts per status via PostgreSQL groupBy
    const jobGroupStats = await prisma.emailJob.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });

    let emailsQueued = 0;
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const item of jobGroupStats) {
      if (item.status === JobStatus.SCHEDULED || item.status === JobStatus.PROCESSING) {
        emailsQueued += item._count._all;
      } else if (item.status === JobStatus.SENT) {
        emailsSent += item._count._all;
      } else if (item.status === JobStatus.FAILED) {
        emailsFailed += item._count._all;
      }
    }

    // 3. Aggregate total recipients count
    const recipientAggregate = await prisma.campaignRecipient.aggregate({
      where: { campaign: { userId } },
      _count: { _all: true },
    });

    const totalRecipients = recipientAggregate._count._all;

    // Calculate delivery rate percentage
    const attemptedCount = emailsSent + emailsFailed;
    const deliveryRate = attemptedCount > 0 ? Number(((emailsSent / attemptedCount) * 100).toFixed(1)) : 0;

    // Map campaign level performance metrics
    const mappedCampaigns = campaigns.map((c) => {
      const cAttempted = c.sentCount + c.failedCount;
      const cRate = cAttempted > 0 ? Number(((c.sentCount / cAttempted) * 100).toFixed(1)) : 0;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        totalRecipients: c.totalRecipients,
        sentCount: c.sentCount,
        failedCount: c.failedCount,
        deliveryRate: cRate,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
      };
    });

    return {
      totalCampaigns,
      activeCampaigns,
      completedCampaigns,
      draftCampaigns,
      cancelledCampaigns,
      totalRecipients,
      emailsQueued,
      emailsSent,
      emailsFailed,
      deliveryRate,
      campaigns: mappedCampaigns,
    };
  }

  /**
   * Retrieves detailed single campaign analytics with recipient breakdown and attempt history.
   */
  static async getCampaignAnalytics(campaignId: string, userId: string): Promise<DetailedCampaignAnalytics> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId },
      include: {
        recipients: {
          select: {
            status: true,
            emailJobId: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found or access denied');
    }

    // Aggregate recipient counts by status
    let pending = 0;
    let sent = 0;
    let failed = 0;
    let cancelled = 0;

    for (const r of campaign.recipients) {
      if (r.status === RecipientStatus.PENDING) pending++;
      else if (r.status === RecipientStatus.SENT) sent++;
      else if (r.status === RecipientStatus.FAILED) failed++;
      else if (r.status === RecipientStatus.CANCELLED) cancelled++;
    }

    // Fetch recent delivery attempts for jobs linked to this campaign
    const jobIds = campaign.recipients
      .map((r) => r.emailJobId)
      .filter((id): id is string => Boolean(id));

    const attempts = jobIds.length > 0
      ? await prisma.emailDeliveryAttempt.findMany({
          where: {
            emailJobId: { in: jobIds },
          },
          take: 10,
          orderBy: { attemptedAt: 'desc' },
          include: {
            emailJob: {
              select: {
                recipient: true,
              },
            },
          },
        })
      : [];

    const cAttempted = campaign.sentCount + campaign.failedCount;
    const deliveryRate = cAttempted > 0 ? Number(((campaign.sentCount / cAttempted) * 100).toFixed(1)) : 0;

    return {
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      status: campaign.status,
      totalRecipients: campaign.totalRecipients,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      deliveryRate,
      createdAt: campaign.createdAt,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      recipientBreakdown: {
        pending,
        sent,
        failed,
        cancelled,
      },
      recentAttempts: attempts.map((a) => ({
        id: a.id,
        recipient: a.emailJob.recipient,
        status: a.status,
        responseCode: a.responseCode,
        error: a.error,
        attemptedAt: a.attemptedAt,
      })),
    };
  }
}
