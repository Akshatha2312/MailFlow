import { prisma } from '../config/prisma';
import { Campaign, CampaignRecipient, CampaignStatus, RecipientStatus, JobStatus, Prisma } from '@prisma/client';
import { canTransitionCampaign, CampaignStatus as SharedCampaignStatus, renderTemplate } from '@mailflow/shared';

export interface CreateCampaignDTO {
  userId: string;
  senderId?: string;
  name: string;
  subject: string;
  body: string;
  scheduledAt?: Date;
}

export interface RecipientInputDTO {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  customData?: Record<string, unknown>;
}

export type CampaignWithRelations = Prisma.CampaignGetPayload<{
  include: { sender: true; recipients: true };
}>;

export class CampaignRepository {
  static async getDefaultSenderIdForUser(userId: string): Promise<string | null> {
    const sender = await prisma.sender.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return sender?.id ?? null;
  }

  static async resolveSenderForUser(userId: string, senderId?: string | null): Promise<string> {
    if (senderId) {
      const sender = await prisma.sender.findFirst({
        where: { id: senderId, userId },
      });

      if (!sender) {
        throw new Error('Sender not found or does not belong to the user.');
      }

      return sender.id;
    }

    const defaultSenderId = await this.getDefaultSenderIdForUser(userId);
    if (!defaultSenderId) {
      throw new Error('Campaign must have a configured Sender before launching');
    }

    return defaultSenderId;
  }

  static async createCampaign(dto: CreateCampaignDTO): Promise<Campaign> {
    const senderId = await this.resolveSenderForUser(dto.userId, dto.senderId);

    return prisma.campaign.create({
      data: {
        userId: dto.userId,
        senderId,
        name: dto.name,
        subject: dto.subject,
        body: dto.body,
        scheduledAt: dto.scheduledAt,
        status: dto.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      },
    });
  }

  static async updateCampaign(
    campaignId: string,
    userId: string,
    data: {
      name?: string;
      subject?: string;
      body?: string;
      senderId?: string;
      scheduledAt?: Date | null;
    }
  ): Promise<Campaign> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.campaign.findFirst({
        where: { id: campaignId, userId },
      });

      if (!existing) {
        throw new Error('Campaign not found or access denied');
      }

      if (existing.status !== CampaignStatus.DRAFT && existing.status !== CampaignStatus.SCHEDULED) {
        throw new Error(`Cannot modify campaign in ${existing.status} status`);
      }

      const resolvedSenderId = data.senderId
        ? await tx.sender.findFirst({ where: { id: data.senderId, userId } }).then((sender) => {
            if (!sender) {
              throw new Error('Sender not found or does not belong to the user.');
            }
            return sender.id;
          })
        : existing.senderId ?? (await this.getDefaultSenderIdForUser(userId));

      if (!resolvedSenderId) {
        throw new Error('Campaign must have a configured Sender before launching');
      }

      return tx.campaign.update({
        where: { id: campaignId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.subject !== undefined ? { subject: data.subject } : {}),
          ...(data.body !== undefined ? { body: data.body } : {}),
          senderId: resolvedSenderId,
          ...(data.scheduledAt !== undefined ? { scheduledAt: data.scheduledAt } : {}),
          status: data.scheduledAt ? CampaignStatus.SCHEDULED : existing.status,
        },
      });
    });
  }

  static async findById(campaignId: string, userId?: string): Promise<CampaignWithRelations | null> {
    return prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(userId ? { userId } : {}),
      },
      include: {
        sender: true,
        recipients: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  static async listByUser(
    userId: string,
    options?: { status?: CampaignStatus; limit?: number; offset?: number }
  ): Promise<{ campaigns: CampaignWithRelations[]; total: number }> {
    const where = {
      userId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
        include: {
          sender: true,
          recipients: true,
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    return { campaigns, total };
  }

  static async setRecipients(
    campaignId: string,
    userId: string,
    recipients: RecipientInputDTO[]
  ): Promise<CampaignRecipient[]> {
    return prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, userId },
      });

      if (!campaign) {
        throw new Error('Campaign not found or access denied');
      }

      if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
        throw new Error(`Cannot modify recipients for campaign in ${campaign.status} status`);
      }

      // Delete existing recipients
      await tx.campaignRecipient.deleteMany({
        where: { campaignId },
      });

      // Insert new recipients
      const created = await Promise.all(
        recipients.map((r) =>
          tx.campaignRecipient.create({
            data: {
              campaignId,
              email: r.email.toLowerCase().trim(),
              firstName: r.firstName,
              lastName: r.lastName,
              company: r.company,
              customData: r.customData ? (r.customData as Prisma.InputJsonValue) : Prisma.JsonNull,
              status: RecipientStatus.PENDING,
            },
          })
        )
      );

      // Update total recipients count
      await tx.campaign.update({
        where: { id: campaignId },
        data: { totalRecipients: created.length },
      });

      return created;
    });
  }

  static async updateStatus(
    campaignId: string,
    targetStatus: CampaignStatus,
    extraData?: { failureReason?: string }
  ): Promise<Campaign> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!current) throw new Error('Campaign not found');

      if (
        !canTransitionCampaign(
          current.status as unknown as SharedCampaignStatus,
          targetStatus as unknown as SharedCampaignStatus
        )
      ) {
        throw new Error(`Invalid state transition: Cannot transition Campaign ${campaignId} from ${current.status} to ${targetStatus}`);
      }

      return tx.campaign.update({
        where: { id: campaignId },
        data: {
          status: targetStatus,
          ...(extraData?.failureReason !== undefined ? { failureReason: extraData.failureReason } : {}),
          ...(targetStatus === CampaignStatus.SENDING ? { startedAt: new Date() } : {}),
          ...(targetStatus === CampaignStatus.COMPLETED ? { completedAt: new Date() } : {}),
          ...(targetStatus === CampaignStatus.FAILED ? { failedAt: new Date() } : {}),
        },
      });
    });
  }

  static async deleteCampaign(campaignId: string, userId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, userId },
      });

      if (!campaign) {
        throw new Error('Campaign not found or access denied');
      }

      if (campaign.status === CampaignStatus.SENDING || campaign.status === CampaignStatus.QUEUED) {
        throw new Error(`Cannot delete campaign currently in ${campaign.status} status`);
      }

      await tx.campaign.delete({ where: { id: campaignId } });
      return true;
    });
  }

  /**
   * Launches a campaign by validating recipients & sender, rendering personalized subject & body
   * for each recipient, creating persistent EmailJob records in PostgreSQL, and updating state to QUEUED/SENDING.
   */
  static async launchCampaign(campaignId: string, userId: string): Promise<CampaignWithRelations> {
    const { emailQueue } = await import('../config/queue.js');
    const { Logger } = await import('@mailflow/shared');

    const result = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, userId },
        include: { sender: true, recipients: true },
      });

      if (!campaign) throw new Error('Campaign not found or access denied');

      const effectiveSenderId = campaign.senderId ?? (await tx.sender.findFirst({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }))?.id;

      if (!effectiveSenderId) {
        throw new Error('Campaign must have a configured Sender before launching');
      }

      const sender = await tx.sender.findFirst({
        where: { id: effectiveSenderId, userId },
      });

      if (!sender) {
        throw new Error('Sender not found or does not belong to the user.');
      }

      if (!campaign.recipients || campaign.recipients.length === 0) throw new Error('Campaign has no recipients configured');

      if (campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.SENDING) {
        throw new Error(`Campaign cannot be launched in ${campaign.status} status`);
      }

      const scheduledAt = campaign.scheduledAt ?? new Date();
      const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());

      if (!campaign.senderId || campaign.senderId !== sender.id) {
        await tx.campaign.update({
          where: { id: campaignId },
          data: { senderId: sender.id },
        });
      }

      const createdJobs: { jobId: string; bullJobData: any }[] = [];

      for (const r of campaign.recipients) {
        const personalizedSubject = renderTemplate(campaign.subject, {
          email: r.email,
          firstName: r.firstName,
          lastName: r.lastName,
          company: r.company,
          customData: r.customData as Record<string, unknown> | null,
        });

        const personalizedBody = renderTemplate(campaign.body, {
          email: r.email,
          firstName: r.firstName,
          lastName: r.lastName,
          company: r.company,
          customData: r.customData as Record<string, unknown> | null,
        });

        const idempotencyKey = `campaign-${campaign.id}-recipient-${r.id}`;

        const emailJob = await tx.emailJob.create({
          data: {
            userId: campaign.userId,
            senderId: sender.id,
            recipient: r.email,
            subject: personalizedSubject,
            body: personalizedBody,
            scheduledAt,
            idempotencyKey,
            status: JobStatus.SCHEDULED,
          },
        });

        await tx.campaignRecipient.update({
          where: { id: r.id },
          data: { emailJobId: emailJob.id },
        });

        createdJobs.push({
          jobId: emailJob.id,
          bullJobData: {
            emailJobId: emailJob.id,
            campaignId: campaign.id,
            recipientId: r.id,
            userId: campaign.userId,
          },
        });
      }

      const updated = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          status: CampaignStatus.SENDING,
          startedAt: new Date(),
        },
        include: { sender: true, recipients: true },
      });

      return { campaign: updated, createdJobs, delayMs };
    });

    // Enqueue jobs in BullMQ outside DB transaction to avoid holding locks
    for (const item of result.createdJobs) {
      const bullJob = await emailQueue.add('send-email', item.bullJobData, {
        delay: result.delayMs,
        jobId: item.jobId,
      });

      await prisma.emailJob.update({
        where: { id: item.jobId },
        data: { bullJobId: bullJob.id },
      });
    }

    Logger.info(`🚀 Campaign launched: ${campaignId} with ${result.createdJobs.length} BullMQ jobs enqueued.`);
    return result.campaign;
  }
}
