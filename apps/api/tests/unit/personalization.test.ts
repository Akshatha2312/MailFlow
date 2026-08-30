import { renderTemplate } from '@mailflow/shared';

describe('Personalization Template Engine', () => {
  it('should replace {{firstName}}, {{lastName}}, {{company}}, {{email}} placeholders', () => {
    const template = 'Hi {{firstName}} {{lastName}} from {{company}} ({{email}})!';
    const rendered = renderTemplate(template, {
      firstName: 'Alex',
      lastName: 'Morgan',
      company: 'Acme Corp',
      email: 'alex@acme.com',
    });

    expect(rendered).toBe('Hi Alex Morgan from Acme Corp (alex@acme.com)!');
  });

  it('should handle customData fields in template', () => {
    const template = 'Your discount code is {{discountCode}} for plan {{planName}}.';
    const rendered = renderTemplate(template, {
      email: 'user@test.com',
      customData: {
        discountCode: 'MAIL2026',
        planName: 'Enterprise',
      },
    });

    expect(rendered).toBe('Your discount code is MAIL2026 for plan Enterprise.');
  });

  it('should replace missing fields with empty string safely', () => {
    const template = 'Hello {{firstName}}, welcome to {{company}}!';
    const rendered = renderTemplate(template, {
      email: 'john@example.com',
    });

    expect(rendered).toBe('Hello , welcome to !');
  });

  it('should prevent arbitrary template evaluation code execution', () => {
    const template = 'Hello {{process.env.SECRET}} <%= eval("code") %>!';
    const rendered = renderTemplate(template, {
      email: 'hacker@example.com',
    });

    // Code tags outside {{}} should remain literal text and process.env.SECRET should evaluate to empty string
    expect(rendered).toBe('Hello  <%= eval("code") %>!');
  });
});
