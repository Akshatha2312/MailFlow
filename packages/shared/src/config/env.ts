import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.string().default('4000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().url().default('postgresql://mailflow:mailflow_secret@localhost:5432/mailflow_db?schema=public'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional().default(''),

  ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),

  ETHEREAL_HOST: z.string().optional(),
  ETHEREAL_PORT: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
  ETHEREAL_USER: z.string().optional(),
  ETHEREAL_PASS: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().optional(),

  SESSION_SECRET: z.string().default('mailflow_super_secret_session_key'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}
