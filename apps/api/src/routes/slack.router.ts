import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/prisma';

export const slackRouter = Router();

// Apply session auth middleware to all slack integration routes
slackRouter.use(requireAuth);

/**
 * GET /api/integrations/slack/connect
 * Initiates Slack OAuth 2.0 flow with CSRF state protection
 */
slackRouter.get('/connect', (req: AuthenticatedRequest, res: Response) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:4000/api/integrations/slack/callback';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!clientId) {
    return res.redirect(`${frontendUrl}/dashboard?slack_error=missing_credentials`);
  }

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('slack_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  const scopes = ['incoming-webhook', 'chat:write'];
  const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
  slackAuthUrl.searchParams.append('client_id', clientId);
  slackAuthUrl.searchParams.append('scope', scopes.join(','));
  slackAuthUrl.searchParams.append('redirect_uri', redirectUri);
  slackAuthUrl.searchParams.append('state', state);

  return res.redirect(slackAuthUrl.toString());
});

/**
 * GET /api/integrations/slack/callback
 * Validates OAuth state cookie, exchanges code for access token & incoming webhook URL,
 * and persists SlackConnection safely in PostgreSQL.
 */
slackRouter.get('/callback', async (req: AuthenticatedRequest, res: Response) => {
  const { code, state, error } = req.query;
  const storedState = req.cookies?.slack_oauth_state;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const userId = req.user!.id;

  res.clearCookie('slack_oauth_state');

  if (error) {
    return res.redirect(`${frontendUrl}/dashboard?slack_error=${encodeURIComponent(String(error))}`);
  }

  if (!state || !storedState || state !== storedState) {
    return res.redirect(`${frontendUrl}/dashboard?slack_error=invalid_state`);
  }

  if (!code) {
    return res.redirect(`${frontendUrl}/dashboard?slack_error=missing_code`);
  }

  try {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:4000/api/integrations/slack/callback';

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      return res.redirect(`${frontendUrl}/dashboard?slack_error=${encodeURIComponent(tokenData.error || 'token_exchange_failed')}`);
    }

    const slackUserId = tokenData.authed_user?.id || tokenData.user_id || 'unknown_user';
    const teamId = tokenData.team?.id || 'unknown_team';
    const teamName = tokenData.team?.name || 'Slack Workspace';
    const accessToken = tokenData.access_token;
    const webhookUrl = tokenData.incoming_webhook?.url || null;
    const channelId = tokenData.incoming_webhook?.channel_id || null;

    // Upsert SlackConnection record for authenticated user
    await prisma.slackConnection.upsert({
      where: { userId },
      update: {
        slackUserId,
        teamId,
        teamName,
        accessToken,
        webhookUrl,
        channelId,
      },
      create: {
        userId,
        slackUserId,
        teamId,
        teamName,
        accessToken,
        webhookUrl,
        channelId,
      },
    });

    return res.redirect(`${frontendUrl}/dashboard?slack=connected`);
  } catch (err) {
    return res.redirect(`${frontendUrl}/dashboard?slack_error=server_error`);
  }
});

/**
 * GET /api/integrations/slack/status
 * Returns user Slack integration status (NEVER exposes access tokens or secrets)
 */
slackRouter.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const slackConn = await prisma.slackConnection.findUnique({
      where: { userId },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        channelId: true,
        createdAt: true,
      },
    });

    if (!slackConn) {
      return res.json({ isConnected: false });
    }

    return res.json({
      isConnected: true,
      teamId: slackConn.teamId,
      teamName: slackConn.teamName,
      channelId: slackConn.channelId,
      connectedAt: slackConn.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve Slack status', code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/integrations/slack/disconnect
 * Disconnects Slack by invalidating and deleting user's SlackConnection record
 */
slackRouter.post('/disconnect', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await prisma.slackConnection.deleteMany({
      where: { userId },
    });

    return res.json({ message: 'Slack integration disconnected successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to disconnect Slack', code: 'SERVER_ERROR' });
  }
});
