import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { redisClient } from '../config/redis';
import { elasticClient } from '../config/elasticsearch';
import { HealthCheckResult, InfrastructureHealthStatus } from '@mailflow/shared';

const router = Router();

router.get('/postgres', async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    return res.json({ status: 'healthy', service: 'postgres', latencyMs });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(503).json({ status: 'unhealthy', service: 'postgres', error: errMessage });
  }
});

router.get('/redis', async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
      await redisClient.connect();
    }
    const pong = await redisClient.ping();
    const latencyMs = Date.now() - start;
    if (pong === 'PONG') {
      return res.json({ status: 'healthy', service: 'redis', latencyMs });
    }
    return res.status(503).json({ status: 'unhealthy', service: 'redis', response: pong });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(503).json({ status: 'unhealthy', service: 'redis', error: errMessage });
  }
});

router.get('/elasticsearch', async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const health = await elasticClient.cluster.health({});
    const latencyMs = Date.now() - start;
    const esStatus = health.status === 'red' ? 'unhealthy' : 'healthy';
    return res.json({
      status: esStatus,
      service: 'elasticsearch',
      clusterStatus: health.status,
      latencyMs,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(503).json({ status: 'unhealthy', service: 'elasticsearch', error: errMessage });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  let pgStatus: InfrastructureHealthStatus = 'unhealthy';
  let pgLatency = 0;
  let pgError: string | undefined;

  let redisStatus: InfrastructureHealthStatus = 'unhealthy';
  let redisLatency = 0;
  let redisError: string | undefined;

  let esStatus: InfrastructureHealthStatus = 'unhealthy';
  let esLatency = 0;
  let esError: string | undefined;

  // Postgres Check
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    pgLatency = Date.now() - start;
    pgStatus = 'healthy';
  } catch (err) {
    pgError = err instanceof Error ? err.message : 'Postgres check failed';
  }

  // Redis Check
  try {
    const start = Date.now();
    if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
      await redisClient.connect();
    }
    const pong = await redisClient.ping();
    redisLatency = Date.now() - start;
    if (pong === 'PONG') redisStatus = 'healthy';
  } catch (err) {
    redisError = err instanceof Error ? err.message : 'Redis check failed';
  }

  // Elasticsearch Check
  try {
    const start = Date.now();
    const health = await elasticClient.cluster.health({});
    esLatency = Date.now() - start;
    if (health.status !== 'red') esStatus = 'healthy';
  } catch (err) {
    esError = err instanceof Error ? err.message : 'Elasticsearch check failed';
  }

  const overallStatus: InfrastructureHealthStatus =
    pgStatus === 'healthy' && redisStatus === 'healthy' && esStatus === 'healthy'
      ? 'healthy'
      : pgStatus === 'healthy' || redisStatus === 'healthy' || esStatus === 'healthy'
      ? 'degraded'
      : 'unhealthy';

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      postgres: { status: pgStatus, latencyMs: pgLatency, error: pgError },
      redis: { status: redisStatus, latencyMs: redisLatency, error: redisError },
      elasticsearch: { status: esStatus, latencyMs: esLatency, error: esError },
    },
  };

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
  return res.status(statusCode).json(result);
});

export const healthRouter = router;
