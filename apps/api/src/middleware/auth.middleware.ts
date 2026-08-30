import { Request, Response, NextFunction } from 'express';
import { UserRepository } from '../repositories/user.repository';
import { User } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: User;
  sessionToken?: string;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // Check HttpOnly Cookie
    if (req.cookies && req.cookies.mailflow_session) {
      token = req.cookies.mailflow_session;
    }

    // Check Authorization Header: Bearer <token>
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else {
        token = authHeader;
      }
    }

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required. Please sign in via Google OAuth.',
        code: 'UNAUTHORIZED',
      });
    }

    const session = await UserRepository.findSessionByToken(token);
    if (!session) {
      return res.status(401).json({
        error: 'Invalid or expired session. Please sign in again.',
        code: 'SESSION_EXPIRED',
      });
    }

    req.user = session.user;
    req.sessionToken = token;
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to authenticate session',
      code: 'AUTH_ERROR',
    });
  }
}
