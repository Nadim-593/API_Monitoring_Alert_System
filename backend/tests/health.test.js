/**
 * Tests for GET /api/v1/health
 *
 * We mock:
 *  - The env module so tests don't require real env vars (no process.exit(1))
 *  - mongoose.connection.readyState so we don't need a real DB
 */

// ─── Mock env module before any imports that use it ──────────────────────────
jest.mock('../src/config/env', () => ({
  PORT: '5000',
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost:27017/test',
  FRONTEND_URL: 'http://localhost:3000',
  MISTRAL_API_KEY: 'test-key',
  MISTRAL_MODEL: 'mistral-large-latest',
  DEFAULT_CHECK_INTERVAL_SECONDS: '60',
  DEFAULT_TIMEOUT_MS: '10000',
  DEFAULT_RESPONSE_TIME_THRESHOLD_MS: '2000',
  DEFAULT_ERROR_RATE_THRESHOLD_PERCENT: '10',
}));

// ─── Mock logger to silence output during tests ───────────────────────────────
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));

// ─── Mock pino-http ───────────────────────────────────────────────────────────
jest.mock('pino-http', () =>
  jest.fn(() => (req, res, next) => next())
);

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');

describe('GET /api/v1/health', () => {
  beforeEach(() => {
    // Simulate connected state
    Object.defineProperty(mongoose.connection, 'readyState', {
      get: jest.fn().mockReturnValue(1),
      configurable: true,
    });
  });

  it('should return 200 with healthy status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
  });

  it('should return the correct response structure', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.body).toMatchObject({
      success: true,
      message: 'PulseWatch AI API is running',
      data: {
        status: 'healthy',
        environment: 'test',
        version: '1.0.0',
        database: 'connected',
      },
    });

    // timestamp should be a valid ISO string
    expect(new Date(res.body.data.timestamp).toISOString()).toBe(
      res.body.data.timestamp
    );
  });

  it('should report database as disconnected when mongoose is not connected', async () => {
    Object.defineProperty(mongoose.connection, 'readyState', {
      get: jest.fn().mockReturnValue(0),
      configurable: true,
    });

    const res = await request(app).get('/api/v1/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.database).toBe('disconnected');
  });
});
