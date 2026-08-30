export class Logger {
  private static sanitize(obj: unknown): unknown {
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitize(item));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('smtppass') ||
        lowerKey.includes('accesstoken') ||
        lowerKey.includes('refreshtoken')
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitize(value);
      }
    }
    return sanitized;
  }

  static info(message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const cleanMeta = meta ? JSON.stringify(this.sanitize(meta)) : '';
    console.log(`[INFO] [${timestamp}] ${message} ${cleanMeta}`);
  }

  static warn(message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const cleanMeta = meta ? JSON.stringify(this.sanitize(meta)) : '';
    console.warn(`[WARN] [${timestamp}] ${message} ${cleanMeta}`);
  }

  static error(message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const cleanMeta = meta ? JSON.stringify(this.sanitize(meta)) : '';
    console.error(`[ERROR] [${timestamp}] ${message} ${cleanMeta}`);
  }
}
