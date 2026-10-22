/**
 * Tests for the Monitoring Engine service.
 * Mocks axios and DB models; controls NODE_ENV via process.env.
 */

jest.mock('axios');
jest.mock('../src/models/MonitoredAPI');
jest.mock('../src/models/MonitoringCheck');
jest.mock('../src/services/alertService', () => ({
  createOrUpdateAlert: jest.fn().mockResolvedValue({ alert: { _id: 'a1' }, isNew: true }),
}));
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
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
// Mock node-cron to prevent real scheduling
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

const axios = require('axios');
const MonitoringCheck = require('../src/models/MonitoringCheck');
const { isBlockedUrl, executeCheck, scheduleApi } = require('../src/services/monitoringEngine');

describe('Monitoring Engine', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  // ── isBlockedUrl ──────────────────────────────────────────────────────────

  describe('isBlockedUrl', () => {
    test('blocks localhost in production', () => {
      process.env.NODE_ENV = 'production';
      expect(isBlockedUrl('http://localhost:3000/api')).toBe(true);
    });

    test('blocks 192.168.x.x in production', () => {
      process.env.NODE_ENV = 'production';
      expect(isBlockedUrl('http://192.168.1.1/data')).toBe(true);
    });

    test('blocks 10.x.x.x in production', () => {
      process.env.NODE_ENV = 'production';
      expect(isBlockedUrl('http://10.0.0.1/internal')).toBe(true);
    });

    test('allows public URLs in production', () => {
      process.env.NODE_ENV = 'production';
      expect(isBlockedUrl('https://api.example.com/data')).toBe(false);
      expect(isBlockedUrl('https://jsonplaceholder.typicode.com/posts')).toBe(false);
    });

    test('allows localhost in development', () => {
      process.env.NODE_ENV = 'development';
      expect(isBlockedUrl('http://localhost:3000/api')).toBe(false);
    });
  });

  // ── executeCheck ──────────────────────────────────────────────────────────

  describe('executeCheck', () => {
    const mockApi = {
      _id: 'api-123',
      name: 'TestAPI',
      url: 'https://api.example.com/health',
      method: 'GET',
      timeoutMs: 5000,
      headers: {},
      body: null,
    };

    test('measures response time and returns check data', async () => {
      axios.mockResolvedValue({
        status: 200,
        data: { status: 'ok' },
        headers: {},
      });

      const result = await executeCheck(mockApi);

      expect(result.statusCode).toBe(200);
      expect(result.success).toBe(true);
      expect(result.errorMessage).toBeNull();
      expect(typeof result.responseTimeMs).toBe('number');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('handles network error and returns success=false', async () => {
      axios.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:80'));

      const result = await executeCheck(mockApi);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBeNull();
      expect(result.errorMessage).toMatch(/ECONNREFUSED/);
    });

    test('handles timeout and returns REQUEST_TIMEOUT error message', async () => {
      const timeoutErr = new Error('timeout of 5000ms exceeded');
      timeoutErr.code = 'ECONNABORTED';
      axios.mockRejectedValue(timeoutErr);

      const result = await executeCheck(mockApi);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/timeout/i);
    });
  });

  // ── scheduleApi ───────────────────────────────────────────────────────────

  describe('scheduleApi', () => {
    test('skips disabled API', () => {
      const cron = require('node-cron');
      const disabledApi = {
        _id: 'api-disabled',
        name: 'DisabledAPI',
        url: 'https://api.example.com',
        method: 'GET',
        enabled: false,
        intervalSeconds: 60,
      };

      scheduleApi(disabledApi);

      expect(cron.schedule).not.toHaveBeenCalled();
    });
  });
});
