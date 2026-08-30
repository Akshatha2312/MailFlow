import { prisma } from '../config/prisma';
import { emailQueue } from '../config/queue';
import { EmailJob, JobStatus, AttemptStatus, Prisma } from '@prisma/client';
import { canTransitionJob } from '@mailflow/shared';
import { ElasticsearchService } from '../services/elasticsearch.service';

export interface ScheduleEmailBatchInput {
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startTime?: Date;
  delaySeconds?: number;
  idempotencyKeyPrefix?: string;
}

export interface ListEmailJobsInput {
  userId: string;
  page?: number;
  limit?: number;
  status?: JobStatus;
  recipient?: string;
  subject?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class EmailJobRepository {
  static async createJob(data: {
    userId: string;
    senderId: string;
    recipient: string;
    subject: string;
    body: string;
    scheduledAt: Date;
    idempotencyKey: string;
  }): Promise<EmailJob> {
    const job = await prisma.emailJob.create({
      data: {
        userId: data.userId,
        senderId: data.senderId,
        recipient: data.recipient,
        subject: data.subject,
        body: data.body,
        scheduledAt: data.scheduledAt,
        status: JobStatus.SCHEDULED,
        idempotencyKey: data.idempotencyKey,
      },
    });

    // Non-blocking ES indexing
    ElasticsearchService.indexEmailJob({
      id: job.id,
      userId: job.userId,
      senderId: job.senderId,
      recipient: job.recipient,
      subject: job.subject,
      body: job.body,
      status: job.status,
      scheduledAt: job.scheduledAt.toISOString(),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }).catch(() => {});

    return job;
  }

  static async findById(id: string) {
    return prisma.emailJob.findUnique({
      where: { id },
      include: {
        sender: true,
        attemptsList: {
          orderBy: { attemptedAt: 'desc' },
        },
      },
    });
  }

  static async findByIdempotencyKey(idempotencyKey: string): Promise<EmailJob | null> {
    return prisma.emailJob.findUnique({
      where: { idempotencyKey },
    });
  }

  static async updateStatus(
    id: string,
    targetStatus: JobStatus,
    extra?: {
      sentAt?: Date;
      failedAt?: Date;
      failureReason?: string;
      bullJobId?: string;
    }
  ): Promise<EmailJob> {
    const current = await prisma.emailJob.findUnique({ where: { id } });
    if (!current) {
      throw new Error(`EmailJob ${id} not found`);
    }

    if (!canTransitionJob(current.status as any, targetStatus as any)) {
      throw new Error(`Invalid state transition: Cannot transition EmailJob ${id} from ${current.status} to ${targetStatus}`);
    }

    const updated = await prisma.emailJob.update({
      where: { id },
      data: {
        status: targetStatus,
        sentAt: extra?.sentAt || current.sentAt,
        failedAt: extra?.failedAt || current.failedAt,
        failureReason: extra?.failureReason || current.failureReason,
        bullJobId: extra?.bullJobId || current.bullJobId,
      },
    });

    // Non-blocking ES index update
    ElasticsearchService.indexEmailJob({
      id: updated.id,
      userId: updated.userId,
      senderId: updated.senderId,
      recipient: updated.recipient,
      subject: updated.subject,
      body: updated.body,
      status: updated.status,
      scheduledAt: updated.scheduledAt.toISOString(),
      sentAt: updated.sentAt ? updated.sentAt.toISOString() : null,
      failedAt: updated.failedAt ? updated.failedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }).catch(() => {});

    return updated;
  }

  static async recordAttempt(
    emailJobId: string,
    status: AttemptStatus,
    error?: string,
    responseCode?: string
  ) {
    return prisma.emailDeliveryAttempt.create({
      data: {
        emailJobId,
        status,
        error,
        responseCode,
      },
    });
  }

  static async scheduleBatch(input: ScheduleEmailBatchInput): Promise<{
    scheduledCount: number;
    jobs: EmailJob[];
  }> {
    const sender = await prisma.sender.findFirst({
      where: { id: input.senderId, userId: input.userId },
    });

    if (!sender) {
      throw new Error('Sender not found or does not belong to the user.');
    }

    const startTime = input.startTime && input.startTime.getTime() > Date.now()
      ? input.startTime
      : new Date();
    const delayMs = (input.delaySeconds || 0) * 1000;

    const scheduledJobs: EmailJob[] = [];

    for (let i = 0; i < input.recipients.length; i++) {
      const recipient = input.recipients[i].trim().toLowerCase();
      if (!recipient || !recipient.includes('@')) continue;

      const scheduledAt = new Date(startTime.getTime() + i * delayMs);
      const idempotencyKey =
        input.idempotencyKeyPrefix
          ? `${input.idempotencyKeyPrefix}-${recipient}-${scheduledAt.getTime()}`
          : `${input.userId}-${input.senderId}-${recipient}-${scheduledAt.getTime()}`;

      const existingJob = await this.findByIdempotencyKey(idempotencyKey);
      if (existingJob) {
        scheduledJobs.push(existingJob);
        continue;
      }

      const emailJob = await this.createJob({
        userId: input.userId,
        senderId: input.senderId,
        recipient,
        subject: input.subject,
        body: input.body,
        scheduledAt,
        idempotencyKey,
      });

      const queueDelay = Math.max(0, scheduledAt.getTime() - Date.now());

      const bullJob = await emailQueue.add(
        'send-email',
        {
          emailJobId: emailJob.id,
          userId: input.userId,
          senderId: input.senderId,
          recipient,
          subject: input.subject,
          body: input.body,
        },
        {
          delay: queueDelay,
          jobId: emailJob.id,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        }
      );

      const updatedJob = await prisma.emailJob.update({
        where: { id: emailJob.id },
        data: { bullJobId: String(bullJob.id) },
      });

      scheduledJobs.push(updatedJob);
    }

    return {
      scheduledCount: scheduledJobs.length,
      jobs: scheduledJobs,
    };
  }

  static async listEmailJobs(input: ListEmailJobsInput) {
    const page = Math.max(1, input.page || 1);
    const limit = Math.min(100, Math.max(1, input.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.EmailJobWhereInput = {
      userId: input.userId,
    };

    if (input.status) {
      where.status = input.status;
    }

    if (input.recipient) {
      where.recipient = { contains: input.recipient, mode: 'insensitive' };
    }

    if (input.subject) {
      where.subject = { contains: input.subject, mode: 'insensitive' };
    }

    if (input.dateFrom || input.dateTo) {
      where.scheduledAt = {};
      if (input.dateFrom) where.scheduledAt.gte = input.dateFrom;
      if (input.dateTo) where.scheduledAt.lte = input.dateTo;
    }

    const [total, jobs] = await Promise.all([
      prisma.emailJob.count({ where }),
      prisma.emailJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: {
          sender: {
            select: { name: true, email: true },
          },
        },
      }),
    ]);

    return {
      data: jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getById(id: string, userId: string) {
    return prisma.emailJob.findFirst({
      where: { id, userId },
      include: {
        sender: true,
        attemptsList: {
          orderBy: { attemptedAt: 'desc' },
        },
      },
    });
  }
}
