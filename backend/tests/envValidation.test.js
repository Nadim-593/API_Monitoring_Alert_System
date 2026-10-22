/**
 * Tests for environment variable validation (Zod schema).
 * Directly tests the schema logic without starting the server.
 */
const { z } = require('zod');

// Re-define the schema here so we can test it in isolation
// without triggering process.exit(1) from the real env.js
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

const validEnv = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/pulsewatch',
  MISTRAL_API_KEY: 'sk-test-key-12345',
};

describe('Environment Validation', () => {
  it('should accept valid environment variables', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      PORT: '5000',
      NODE_ENV: 'development',
      FRONTEND_URL: 'http://localhost:3000',
      MISTRAL_MODEL: 'mistral-large-latest',
    });

    expect(result.success).toBe(true);
    expect(result.data.PORT).toBe('5000');
    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.MONGODB_URI).toBe(validEnv.MONGODB_URI);
    expect(result.data.MISTRAL_API_KEY).toBe(validEnv.MISTRAL_API_KEY);
  });

  it('should use defaults for optional variables', () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
    expect(result.data.PORT).toBe('5000');
    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.FRONTEND_URL).toBe('http://localhost:3000');
    expect(result.data.MISTRAL_MODEL).toBe('mistral-large-latest');
    expect(result.data.DEFAULT_CHECK_INTERVAL_SECONDS).toBe('60');
    expect(result.data.DEFAULT_TIMEOUT_MS).toBe('10000');
    expect(result.data.DEFAULT_RESPONSE_TIME_THRESHOLD_MS).toBe('2000');
    expect(result.data.DEFAULT_ERROR_RATE_THRESHOLD_PERCENT).toBe('10');
  });

  it('should fail with missing MONGODB_URI', () => {
    const result = envSchema.safeParse({
      MISTRAL_API_KEY: 'sk-test-key-12345',
    });

    expect(result.success).toBe(false);
    const errors = result.error.errors.map((e) => e.path[0]);
    expect(errors).toContain('MONGODB_URI');
  });

  it('should fail with missing MISTRAL_API_KEY', () => {
    const result = envSchema.safeParse({
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/pulsewatch',
    });

    expect(result.success).toBe(false);
    const errors = result.error.errors.map((e) => e.path[0]);
    expect(errors).toContain('MISTRAL_API_KEY');
  });

  it('should reject an invalid NODE_ENV value', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'staging',
    });

    expect(result.success).toBe(false);
    const errors = result.error.errors.map((e) => e.path[0]);
    expect(errors).toContain('NODE_ENV');
  });

  it('should reject an invalid FRONTEND_URL', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      FRONTEND_URL: 'not-a-valid-url',
    });

    expect(result.success).toBe(false);
    const errors = result.error.errors.map((e) => e.path[0]);
    expect(errors).toContain('FRONTEND_URL');
  });
});
