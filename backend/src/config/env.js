const { z } = require('zod');

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  MISTRAL_API_KEY: z.string().min(1, 'MISTRAL_API_KEY is required'),
  MISTRAL_MODEL: z.string().default('mistral-large-latest'),
  DEFAULT_CHECK_INTERVAL_SECONDS: z.string().default('60'),
  DEFAULT_TIMEOUT_MS: z.string().default('10000'),
  DEFAULT_RESPONSE_TIME_THRESHOLD_MS: z.string().default('2000'),
  DEFAULT_ERROR_RATE_THRESHOLD_PERCENT: z.string().default('10'),
});

// Parse and validate process.env
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

module.exports = parsed.data;
