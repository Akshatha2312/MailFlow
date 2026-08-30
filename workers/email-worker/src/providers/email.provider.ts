import * as nodemailer from 'nodemailer';

export interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  response?: string;
  error?: string;
}

export interface IEmailProvider {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
}

export class SMTPEmailProvider implements IEmailProvider {
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      // Use custom SMTP credentials if provided, otherwise fallback to Ethereal dev configuration
      const host = options.smtpHost || process.env.ETHEREAL_HOST || 'smtp.ethereal.email';
      const port = options.smtpPort || (process.env.ETHEREAL_PORT ? Number(process.env.ETHEREAL_PORT) : 587);
      const user = options.smtpUser || process.env.ETHEREAL_USER;
      const pass = options.smtpPass || process.env.ETHEREAL_PASS;

      let transporter: nodemailer.Transporter;

      if (user && pass) {
        transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
      } else {
        // Safe development fallback using Ethereal test account if credentials are not configured
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      }

      const info = await transporter.sendMail({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>?/gm, ''),
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'SMTP delivery failed';
      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}

/**
 * MockEmailProvider for high-throughput load and stress testing.
 * Simulates ultra-fast delivery without network latency or external SMTP rate limits.
 */
export class MockEmailProvider implements IEmailProvider {
  async sendEmail(_options: SendEmailOptions): Promise<SendEmailResult> {
    // Ultra-fast simulated delivery
    return {
      success: true,
      messageId: `<mock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@mailflow.test>`,
      response: '250 2.0.0 OK Mock Delivery Complete',
    };
  }
}

export class EmailProviderFactory {
  static createProvider(): IEmailProvider {
    if (process.env.EMAIL_PROVIDER === 'mock') {
      return new MockEmailProvider();
    }
    return new SMTPEmailProvider();
  }
}
