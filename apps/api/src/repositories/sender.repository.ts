import { prisma } from '../config/prisma';
import { Sender } from '@prisma/client';

export class SenderRepository {
  static async createSender(data: {
    userId: string;
    email: string;
    name?: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    hourlyLimit?: number;
    isDefault?: boolean;
  }): Promise<Sender> {
    return prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.sender.updateMany({
          where: { userId: data.userId },
          data: { isDefault: false },
        });
      }

      return tx.sender.create({
        data: {
          userId: data.userId,
          email: data.email,
          name: data.name,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          smtpUser: data.smtpUser,
          smtpPass: data.smtpPass,
          hourlyLimit: data.hourlyLimit ?? 100,
          isDefault: data.isDefault ?? false,
        },
      });
    });
  }

  static async findByUserId(userId: string): Promise<Sender[]> {
    return prisma.sender.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async findById(id: string, userId?: string): Promise<Sender | null> {
    return prisma.sender.findFirst({
      where: {
        id,
        ...(userId ? { userId } : {}),
      },
    });
  }
}
