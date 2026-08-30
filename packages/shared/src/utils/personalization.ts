export interface PersonalizationContext {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  customData?: Record<string, unknown> | null;
}

/**
 * Safely replaces template placeholders like {{firstName}}, {{lastName}}, {{company}}, {{email}}
 * or {{customKey}} in subject lines or HTML email bodies without arbitrary code execution vulnerabilities.
 */
export function renderTemplate(template: string, context: PersonalizationContext): string {
  if (!template) return '';

  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const trimmedKey = key.trim();

    if (trimmedKey === 'firstName') return context.firstName ?? '';
    if (trimmedKey === 'lastName') return context.lastName ?? '';
    if (trimmedKey === 'company') return context.company ?? '';
    if (trimmedKey === 'email') return context.email ?? '';

    // Handle customData fields if nested under customData or key directly
    if (context.customData && typeof context.customData === 'object') {
      if (trimmedKey in context.customData) {
        const val = context.customData[trimmedKey];
        return val !== null && val !== undefined ? String(val) : '';
      }
    }

    return '';
  });
}
