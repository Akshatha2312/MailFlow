import { prisma } from '../config/prisma';
import { redisClient as redis } from '../config/redis';

export class RateLimitRepository {
  static getHourlyWindowStart(date: Date = new Date()): Date {
    const windowStart = new Date(date);
    windowStart.setMinutes(0, 0, 0);
    return windowStart;
  }

  static getWindowStart(date: Date = new Date()): Date {
    return this.getHourlyWindowStart(date);
  }

  static async checkAndIncrementSenderLimitAtomic(
    senderId: string,
    limit: number = 100
  ): Promise<{ allowed: boolean; count: number; resetInMs: number }> {
    const now = new Date();
    const windowStart = this.getHourlyWindowStart(now);
    const windowTimestamp = windowStart.getTime();
    const redisKey = `rate_limit:sender:${senderId}:hour:${windowTimestamp}`;

    const nextHour = new Date(windowStart.getTime() + 60 * 60 * 1000);
    const resetInMs = Math.max(1000, nextHour.getTime() - now.getTime());

    try {
      if (redis.status === 'wait') await redis.connect();

      const luaScript = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        return current
      `;

      const currentCount = (await redis.eval(luaScript, 1, redisKey, resetInMs)) as number;

      if (currentCount > limit) {
        return {
          allowed: false,
          count: currentCount,
          resetInMs,
        };
      }

      await prisma.rateLimitWindow.upsert({
        where: {
          senderId_windowStart: {
            senderId,
            windowStart,
          },
        },
        update: {
          sentCount: { increment: 1 },
        },
        create: {
          senderId,
          windowStart,
          sentCount: 1,
        },
      });

      return {
        allowed: true,
        count: currentCount,
        resetInMs,
      };
    } catch (err) {
      const dbWindow = await prisma.rateLimitWindow.upsert({
        where: {
          senderId_windowStart: {
            senderId,
            windowStart,
          },
        },
        update: {
          sentCount: { increment: 1 },
        },
        create: {
          senderId,
          windowStart,
          sentCount: 1,
        },
      });

      return {
        allowed: dbWindow.sentCount <= limit,
        count: dbWindow.sentCount,
        resetInMs,
      };
    }
  }

  static async hasSlackAlertBeenSent(senderId: string, windowTimestamp: number): Promise<boolean> {
    const key = `rate_limit_alert_sent:${senderId}:${windowTimestamp}`;
    try {
      if (redis.status === 'wait') await redis.connect();
      const exists = await redis.exists(key);
      return exists === 1;
    } catch {
      return false;
    }
  }

  static async markSlackAlertSent(senderId: string, windowTimestamp: number): Promise<void> {
    const key = `rate_limit_alert_sent:${senderId}:${windowTimestamp}`;
    try {
      if (redis.status === 'wait') await redis.connect();
      await redis.set(key, '1', 'PX', 3600 * 1000);
    } catch {}
  }

  static async getSentCountInCurrentWindow(senderId: string, now: Date = new Date()): Promise<number> {
    const windowStart = this.getHourlyWindowStart(now);
    const redisKey = `rate_limit:sender:${senderId}:hour:${windowStart.getTime()}`;

    try {
      if (redis.status === 'wait') await redis.connect();
      const val = await redis.get(redisKey);
      if (val) return parseInt(val, 10);
    } catch {}

    const window = await prisma.rateLimitWindow.findUnique({
      where: {
        senderId_windowStart: {
          senderId,
          windowStart,
        },
      },
    });

    return window ? window.sentCount : 0;
  }

  static async incrementSentCount(senderId: string, now: Date = new Date()) {
    const windowStart = this.getHourlyWindowStart(now);
    return prisma.rateLimitWindow.upsert({
      where: {
        senderId_windowStart: {
          senderId,
          windowStart,
        },
      },
      create: {
        senderId,
        windowStart,
        sentCount: 1,
      },
      update: {
        sentCount: { increment: 1 },
      },
    });
  }
}
