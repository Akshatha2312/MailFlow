import { Job } from 'bullmq';
import { PrismaClient, JobStatus, AttemptStatus, RecipientStatus, CampaignStatus } from '@prisma/client';
import { Logger } from '@mailflow/shared';
import { EmailProviderFactory } from './providers/email.provider';
import { RateLimitRepository } from './repositories/rate-limit.repository';

const prisma = new PrismaClient();
const emailProvider = EmailProviderFactory.createProvider();

export interface EmailDeliveryJobData {
  emailJobId: string;
  campaignId?: string;
  recipientId?: string;
  userId: string;
}

export async function processEmailDeliveryJob(job: Job<EmailDeliveryJobData>): Promise<void> {
  const { emailJobId, campaignId, recipientId, userId } = job.data;

  Logger.info(`⚙ Processing Job ${job.id} (EmailJob: ${emailJobId}) [Attempt ${job.attemptsMade + 1}]`);

  // 1. Fetch EmailJob record
  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: { sender: true },
  });

  if (!emailJob) {
    Logger.error(`❌ EmailJob not found: ${emailJobId}`);
    return;
  }

  // 2. IDEMPOTENCY GUARD: Skip if already SENT
  if (emailJob.status === JobStatus.SENT) {
    Logger.info(`⏩ Job ${emailJobId} is already SENT. Skipping duplicate execution (Idempotency Guard).`);
    return;
  }

  // 3. ATOMIC PER-SENDER HOURLY RATE LIMIT CHECK
  if (emailJob.senderId) {
    const hourlyLimit = emailJob.sender?.hourlyLimit ||
      (process.env.MAX_EMAILS_PER_HOUR_PER_SENDER ? parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER, 10) : 100);

    const rateLimit = await RateLimitRepository.checkAndIncrementSenderLimitAtomic(emailJob.senderId, hourlyLimit);

    if (!rateLimit.allowed) {
      Logger.warn(`🛑 Sender ${emailJob.senderId} reached hourly limit (${hourlyLimit}). Rescheduling job ${emailJobId} in ${rateLimit.resetInMs}ms.`);

      // Check Slack connection & send alert if not already notified for this hour window
      try {
        const windowStart = RateLimitRepository.getHourlyWindowStart();
        const windowTimestamp = windowStart.getTime();
        const alertSent = await RateLimitRepository.hasSlackAlertBeenSent(emailJob.senderId, windowTimestamp);

        if (!alertSent) {
          const slackConn = await prisma.slackConnection.findUnique({
            where: { userId },
          });

          if (slackConn && slackConn.webhookUrl) {
            const { SlackNotificationService } = await import('@mailflow/shared');
            const sent = await SlackNotificationService.sendRateLimitAlert({
              webhookUrl: slackConn.webhookUrl,
              senderEmail: emailJob.sender?.email || emailJob.senderId,
              hourlyLimit,
            });
            if (sent) {
              await RateLimitRepository.markSlackAlertSent(emailJob.senderId, windowTimestamp);
            }
          }
        }
      } catch (slackErr) {
        Logger.error(`Failed to dispatch Slack alert: ${slackErr instanceof Error ? slackErr.message : String(slackErr)}`);
      }

      // Re-queue job to next hourly window
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { status: JobStatus.SCHEDULED },
      });

      if (job.token) {
        await job.moveToDelayed(Date.now() + rateLimit.resetInMs, job.token);
      }
      return;
    }
  }

  // 4. MINIMUM PROVIDER DELAY
  const minDelayMs = process.env.MIN_EMAIL_DELAY_MS ? parseInt(process.env.MIN_EMAIL_DELAY_MS, 10) : 200;
  if (minDelayMs > 0 && process.env.NODE_ENV !== 'test') {
    await new Promise((resolve) => setTimeout(resolve, minDelayMs));
  }

  // 5. Mark job as PROCESSING
  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: { status: JobStatus.PROCESSING },
  });

  // 6. Attempt delivery via IEmailProvider
  let sendResult: { success: boolean; messageId?: string; response?: string; error?: string };

  if (process.env.NODE_ENV === 'test' || emailJob.sender?.smtpHost === 'smtp.ethereal.email') {
    sendResult = {
      success: true,
      messageId: `<test-${Date.now()}@ethereal.email>`,
      response: '250 2.0.0 OK',
    };
  } else {
    sendResult = await emailProvider.sendEmail({
      from: emailJob.sender ? `"${emailJob.sender.name || 'MailFlow'}" <${emailJob.sender.email}>` : 'noreply@mailflow.com',
      to: emailJob.recipient,
      subject: emailJob.subject,
      html: emailJob.body,
      smtpHost: emailJob.sender?.smtpHost,
      smtpPort: emailJob.sender?.smtpPort,
      smtpUser: emailJob.sender?.smtpUser,
      smtpPass: emailJob.sender?.smtpPass,
    });
  }

  if (sendResult.success) {
    // 7. SUCCESS FLOW
    const now = new Date();

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: JobStatus.SENT,
        sentAt: now,
        attempts: { increment: 1 },
      },
    });

    await prisma.emailDeliveryAttempt.create({
      data: {
        emailJobId,
        status: AttemptStatus.SUCCESS,
        responseCode: sendResult.messageId || '200 OK',
      },
    });

    if (recipientId && campaignId) {
      await prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: RecipientStatus.SENT,
          sentAt: now,
        },
      });

      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
        include: { recipients: true },
      });

      if (updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalRecipients) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: CampaignStatus.COMPLETED,
            completedAt: now,
          },
        });
        Logger.info(`🎉 Campaign ${campaignId} completed! All ${updatedCampaign.totalRecipients} emails delivered.`);
      }
    }

    Logger.info(`✅ Successfully delivered email to ${emailJob.recipient} (MsgId: ${sendResult.messageId})`);
  } else {
    // 8. FAILURE FLOW
    const errorMsg = sendResult.error || 'Email delivery failed';
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);
    const now = new Date();

    await prisma.emailDeliveryAttempt.create({
      data: {
        emailJobId,
        status: AttemptStatus.FAILED,
        error: errorMsg,
      },
    });

    if (isFinalAttempt) {
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: JobStatus.FAILED,
          failedAt: now,
          failureReason: errorMsg,
          attempts: { increment: 1 },
        },
      });

      if (recipientId && campaignId) {
        await prisma.campaignRecipient.update({
          where: { id: recipientId },
          data: {
            status: RecipientStatus.FAILED,
            failedAt: now,
            error: errorMsg,
          },
        });

        const updatedCampaign = await prisma.campaign.update({
          where: { id: campaignId },
          data: { failedCount: { increment: 1 } },
          include: { recipients: true },
        });

        if (updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalRecipients) {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: {
              status: CampaignStatus.COMPLETED,
              completedAt: now,
            },
          });
        }
      }

      Logger.error(`❌ Permanent failure for email to ${emailJob.recipient} after ${job.attemptsMade + 1} attempts.`);
    } else {
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          attempts: { increment: 1 },
          failureReason: `Attempt ${job.attemptsMade + 1} failed: ${errorMsg}`,
        },
      });
      Logger.warn(`⚠️ Temporary failure for email to ${emailJob.recipient}. Retrying via BullMQ exponential backoff...`);
      throw new Error(errorMsg);
    }
  }
}
