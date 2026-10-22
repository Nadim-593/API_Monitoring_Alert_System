/**
 * Tests for GET /api/v1/monitoring/summary and /api/v1/monitoring/history
 */

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

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));

jest.mock('pino-http', () =>
  jest.fn(() => (req, res, next) => next())
);

jest.mock('../src/models/MonitoredAPI');
jest.mock('../src/models/MonitoringCheck');
jest.mock('../src/models/Alert');

const MonitoredAPI = require('../src/models/MonitoredAPI');
const MonitoringCheck = require('../src/models/MonitoringCheck');
const Alert = require('../src/models/Alert');
const request = require('supertest');
const app = require('../src/app');

describe('Monitoring Dashboard Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/monitoring/summary', () => {
    test('returns aggregated dashboard metrics for APIs, checks, and alerts', async () => {
      // Mock counts
      MonitoredAPI.countDocuments
        .mockResolvedValueOnce(5) // totalApis
        .mockResolvedValueOnce(4); // activeApis

      MonitoringCheck.countDocuments
        .mockResolvedValueOnce(100) // totalChecks24h
        .mockResolvedValueOnce(98); // successfulChecks24h

      MonitoringCheck.aggregate.mockResolvedValueOnce([
        { _id: null, avgLatency: 145.6 },
      ]);

      Alert.countDocuments.mockResolvedValueOnce(2); // activeAlerts

      Alert.aggregate.mockResolvedValueOnce([
        { _id: 'critical', count: 1 },
        { _id: 'warning', count: 1 },
      ]);

      const mockRecent = [
        { _id: 'alt-1', apiName: 'TestAPI', severity: 'critical', status: 'open' },
      ];
      Alert.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockRecent),
      });

      const res = await request(app).get('/api/v1/monitoring/summary');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.apis.total).toBe(5);
      expect(data.apis.active).toBe(4);
      expect(data.apis.inactive).toBe(1);

      expect(data.metrics24h.totalChecks).toBe(100);
      expect(data.metrics24h.successfulChecks).toBe(98);
      expect(data.metrics24h.failedChecks).toBe(2);
      expect(data.metrics24h.uptimePercent).toBe(98);
      expect(data.metrics24h.avgResponseTimeMs).toBe(146);

      expect(data.alerts.totalActive).toBe(2);
      expect(data.alerts.bySeverity.critical).toBe(1);
      expect(data.alerts.bySeverity.warning).toBe(1);
      expect(data.alerts.bySeverity.high).toBe(0);
      expect(data.alerts.recent).toHaveLength(1);
    });
  });

  describe('GET /api/v1/monitoring/history', () => {
    test('returns paginated check history with filters', async () => {
      const mockChecks = [
        { _id: 'c1', apiName: 'OrdersAPI', statusCode: 200, responseTimeMs: 120 },
        { _id: 'c2', apiName: 'OrdersAPI', statusCode: 200, responseTimeMs: 135 },
      ];

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockChecks),
      };

      MonitoringCheck.find = jest.fn().mockReturnValue(mockFind);
      MonitoringCheck.countDocuments = jest.fn().mockResolvedValue(2);

      const res = await request(app).get('/api/v1/monitoring/history?api_name=OrdersAPI&page=1&limit=10');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checks).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.pagination.page).toBe(1);
    });
  });
});
