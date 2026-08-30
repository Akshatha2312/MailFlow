import { prisma } from '../config/prisma';
import { User, Session } from '@prisma/client';
import crypto from 'crypto';

export class UserRepository {
  static async upsertGoogleUser(data: {
    email: string;
    name?: string;
    avatar?: string;
    providerAccountId: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }): Promise<User> {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {
        name: data.name || undefined,
        picture: data.avatar || undefined,
      },
      create: {
        email: data.email,
        name: data.name || data.email.split('@')[0],
        picture: data.avatar || null,
      },
    });

    // Upsert Google OAuth Account record
    await prisma.oAuthAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: data.providerAccountId,
        },
      },
      update: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      },
      create: {
        userId: user.id,
        provider: 'google',
        providerAccountId: data.providerAccountId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      },
    });

    // Ensure the user has exactly one default Ethereal Sender (idempotent upsert)
    // Use (userId, email) unique constraint to upsert on the default sender
    await prisma.$transaction(async (tx) => {
      // Upsert the default sender using userId + email composite key
      await tx.sender.upsert({
        where: {
          userId_email: {
            userId: user.id,
            email: user.email,
          },
        },
        update: {
          // Update: ensure this is marked as default
          isDefault: true,
          name: `${user.name || user.email.split('@')[0]}'s Ethereal Sender`,
          smtpHost: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
          smtpPort: Number(process.env.ETHEREAL_PORT) || 587,
          smtpUser: process.env.ETHEREAL_USER || 'ethereal_user',
          smtpPass: process.env.ETHEREAL_PASS || 'ethereal_pass',
          hourlyLimit: 100,
        },
        create: {
          userId: user.id,
          name: `${user.name || user.email.split('@')[0]}'s Ethereal Sender`,
          email: user.email,
          smtpHost: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
          smtpPort: Number(process.env.ETHEREAL_PORT) || 587,
          smtpUser: process.env.ETHEREAL_USER || 'ethereal_user',
          smtpPass: process.env.ETHEREAL_PASS || 'ethereal_pass',
          hourlyLimit: 100,
          isDefault: true,
        },
      });

      // Atomically unset isDefault on any other senders for this user
      await tx.sender.updateMany({
        where: {
          userId: user.id,
          email: { not: user.email }, // Exclude the default sender we just upserted
        },
        data: { isDefault: false },
      });
    });

    return user;
  }

  static async createSession(userId: string): Promise<Session> {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return prisma.session.create({
      data: {
        userId,
        sessionToken,
        expires,
      },
    });
  }

  static async findSessionByToken(sessionToken: string): Promise<(Session & { user: User }) | null> {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    if (!session || session.expires < new Date()) {
      return null;
    }

    return session;
  }

  static async deleteSession(sessionToken: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { sessionToken },
    });
  }

  static async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  static async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }
}
