import { SMTPEmailProvider, EmailProviderFactory } from '../../../../workers/email-worker/src/providers/email.provider';

describe('IEmailProvider & SMTPEmailProvider Abstraction', () => {
  it('should instantiate SMTPEmailProvider via EmailProviderFactory', () => {
    const provider = EmailProviderFactory.createProvider();
    expect(provider).toBeInstanceOf(SMTPEmailProvider);
  });

  it('should safely format email parameters in development SMTP mode', async () => {
    const provider = new SMTPEmailProvider();
    const result = await provider.sendEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test Provider Subject',
      html: '<p>Test Provider Content</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  }, 15000);
});
