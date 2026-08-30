import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { UserRepository } from '../repositories/user.repository';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

export const authRouter = Router();

// Store temporary state tokens in memory (or Redis in multi-instance prod)
const pendingStates = new Set<string>();

/**
 * GET /api/auth/google
 * Initiates Google OAuth 2.0 flow by generating authorization redirect URL
 */
authRouter.get('/google', (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!clientId || clientId.trim() === '' || clientId === 'mock-google-client-id') {
    return res.redirect(`${frontendUrl}/login?error=google_oauth_not_configured`);
  }

  const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/auth/google/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.add(state);

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${encodeURIComponent(
    'openid email profile'
  )}&state=${state}&prompt=select_account`;

  res.redirect(googleAuthUrl);
});

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback code exchange and session establishment
 */
authRouter.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (error || !code) {
    return res.redirect(`${frontendUrl}/login?error=oauth_cancelled`);
  }

  if (state && typeof state === 'string' && pendingStates.has(state)) {
    pendingStates.delete(state);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/auth/google/callback`;

  if (!clientId || !clientSecret || clientId.trim() === '' || clientSecret.trim() === '') {
    return res.redirect(`${frontendUrl}/login?error=google_oauth_not_configured`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      return res.redirect(`${frontendUrl}/login?error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json();
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return res.redirect(`${frontendUrl}/login?error=user_info_failed`);
    }

    const profile = await userRes.json();
    const email: string = profile.email;
    const name: string = profile.name || profile.given_name || email.split('@')[0];
    const avatar: string | undefined = profile.picture;
    const googleId: string = profile.id;

    if (!email || !googleId) {
      return res.redirect(`${frontendUrl}/login?error=invalid_user_profile`);
    }

    // Upsert user and establish session
    const user = await UserRepository.upsertGoogleUser({
      email,
      name,
      avatar,
      providerAccountId: googleId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : undefined,
    });

    const session = await UserRepository.createSession(user.id);

    // Set HttpOnly cookie
    res.cookie('mailflow_session', session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(`${frontendUrl}/dashboard`);
  } catch (err) {
    return res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user profile
 */
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    user: req.user,
  });
});

/**
 * POST /api/auth/logout
 * Clears session cookie and invalidates session token
 */
authRouter.post('/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionToken) {
    await UserRepository.deleteSession(req.sessionToken);
  }
  res.clearCookie('mailflow_session');
  return res.json({ success: true, message: 'Logged out successfully' });
});
