import { Logger } from '../utils/logger';

export interface SendRateLimitAlertOptions {
  webhookUrl: string;
  senderEmail: string;
  hourlyLimit: number;
}

export class SlackNotificationService {
  /**
   * Sends a real Slack notification payload when a sender hits its hourly sending limit
   */
  static async sendRateLimitAlert(options: SendRateLimitAlertOptions): Promise<boolean> {
    if (!options.webhookUrl) {
      Logger.warn('SlackNotificationService: Missing webhookUrl. Skipping notification.');
      return false;
    }

    try {
      const payload = {
        text: `⚠️ *MailFlow Rate Limit Alert*: Sender \`${options.senderEmail}\` has reached its hourly sending limit of ${options.hourlyLimit} emails.`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ MailFlow Hourly Rate Limit Reached',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Sender:* \`${options.senderEmail}\``,
              },
              {
                type: 'mrkdwn',
                text: `*Hourly Limit:* ${options.hourlyLimit} emails`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Additional scheduled emails have been automatically deferred to the next hourly window without data loss.',
            },
          },
        ],
      };

      const response = await fetch(options.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        Logger.error(`SlackNotificationService: Webhook returned HTTP status ${response.status}`);
        return false;
      }

      Logger.info(`📢 Slack notification successfully delivered for sender ${options.senderEmail}`);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      Logger.error(`SlackNotificationService: Delivery failed with error: ${errorMsg}`);
      return false;
    }
  }
}
