import dotenv from 'dotenv';
import path from 'path';

// Load root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { app } from './app';
import { validateEnv } from '@mailflow/shared';
import { prisma } from './config/prisma';
import { redisClient } from './config/redis';

const env = validateEnv();

async function startServer() {
  try {
    // Verify database connections on boot
    await prisma.$connect();
    console.log('✅ PostgreSQL connected via Prisma');

    if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
      await redisClient.connect();
    }

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 MailFlow API listening on port ${env.PORT} (${env.NODE_ENV} mode)`);
      console.log(`🏥 Health endpoints available at http://localhost:${env.PORT}/health`);
    });

    const shutdown = async () => {
      console.log('Shutting down server gracefully...');
      server.close(async () => {
        await prisma.$disconnect();
        redisClient.disconnect();
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
