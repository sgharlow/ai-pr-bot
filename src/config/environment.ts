import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database Configuration
  DATABASE_URL: z.string().url(),

  // Redis Configuration
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),

  // GitHub Configuration
  GITHUB_APP_ID: z.string(),
  GITHUB_PRIVATE_KEY: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),

  // OpenAI Configuration
  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string().default('gpt-4'),
  OPENAI_MAX_TOKENS: z.coerce.number().default(4000),

  // Cost Management
  DEFAULT_COST_LIMIT: z.coerce.number().default(100.00),
  TOKEN_COST_PER_1K: z.coerce.number().default(0.03),

  // Slack Configuration (Optional)
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),

  // Discord Configuration (Optional)
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),

  // Security
  JWT_SECRET: z.string(),
  WEBHOOK_SECRET: z.string(),

  // Queue Configuration
  QUEUE_CONCURRENCY: z.coerce.number().default(5),
  QUEUE_MAX_ATTEMPTS: z.coerce.number().default(3),
  QUEUE_DELAY: z.coerce.number().default(1000),

  // Analysis Configuration
  MAX_FILE_SIZE: z.coerce.number().default(1048576), // 1MB
  MAX_DIFF_SIZE: z.coerce.number().default(10240), // 10KB
  ANALYSIS_TIMEOUT: z.coerce.number().default(30000), // 30 seconds

  // Docker Configuration
  SEMGREP_IMAGE: z.string().default('returntocorp/semgrep:latest'),
  DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
});

export const config = envSchema.parse(process.env);

export type Config = z.infer<typeof envSchema>;