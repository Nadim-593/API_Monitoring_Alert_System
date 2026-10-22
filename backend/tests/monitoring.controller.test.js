/**
 * Tests for POST /api/v1/monitor
 * Mocks DB models and services to avoid real DB calls.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
jest.mock('../src/services/alertService', () => ({
  createOrUpdateAlert: jest.fn(),
  generateFingerprint: jest.fn(),
  resolveAlert: jest.fn(),
  acknowledgeAlert: jest.fn(),
}));

const MonitoredAPI = require('../src/models/MonitoredAPI');
const MonitoringCheck = require('../src/models/MonitoringCheck');
const alertService = require('../src/services/alertService');

const request = require('supertest');
const app = require('../src/app');

// Helper: build a MonitoringCheck instance mock
function buildCheckMock(id = 'check-id-123') {
  const instance = { _id: id, save: jest.fn().mockResolvedValue(undefined) };
  MonitoringCheck.mockImplementation(() => instance);
  return instance;
}

describe('POST /api/v1/monitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: API not found in DB
    MonitoredAPI.findOne = jest.fn().mockResolvedValue(null);
    // Default alert service mock
    alertService.createOrUpdateAlert.mockResolvedValue({
      alert: { _id: 'alert-id-001' },
      isNew: true,
    });
  });

  test('processes single valid check and returns 200', async () => {
    buildCheckMock('check-abc');

    const res = await request(app)
      .post('/api/v1/monitor')
      .send({
        api_name: 'TestAPI',
        response_time_ms: 150,
        status_code: 200,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.processed).toBe(1);
    expect(res.body.data.anomaliesDetected).toBe(0);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0].api_name).toBe('TestAPI');
    expect(res.body.data.results[0].anomalyDetected).toBe(false);
  });

  test('processes batch of checks and returns correct counts', async () => {
    let callCount = 0;
    MonitoringCheck.mockImplementation(() => ({
      _id: `check-${++callCount}`,
      save: jest.fn().mockResolvedValue(undefined),
    }));

    const res = await request(app)
      .post('/api/v1/monitor')
      .send([
        { api_name: 'API_One', response_time_ms: 100, status_code: 200 },
        { api_name: 'API_Two', response_time_ms: 200, status_code: 200 },
      ]);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.processed).toBe(2);
    expect(res.body.data.results).toHaveLength(2);
  });

  test('returns 400 for invalid input (missing required fields)', async () => {
    const res = await request(app)
      .post('/api/v1/monitor')
      .send({ api_name: 'BadInput' }); // missing response_time_ms and status_code

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 for negative response_time_ms', async () => {
    const res = await request(app)
      .post('/api/v1/monitor')
      .send({
        api_name: 'NegTime',
        response_time_ms: -10,
        status_code: 200,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('detects anomaly in batch and includes alert id in response', async () => {
    let callCount = 0;
    MonitoringCheck.mockImplementation(() => ({
      _id: `check-${++callCount}`,
      save: jest.fn().mockResolvedValue(undefined),
    }));

    alertService.createOrUpdateAlert.mockResolvedValue({
      alert: { _id: 'alert-xyz' },
      isNew: true,
    });

    const res = await request(app)
      .post('/api/v1/monitor')
      .send([
        { api_name: 'GoodAPI', response_time_ms: 100, status_code: 200 },
        { api_name: 'BadAPI', response_time_ms: 100, status_code: 500 },
      ]);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.anomaliesDetected).toBe(1);
    expect(res.body.data.alerts).toContain('alert-xyz');

    const badResult = res.body.data.results.find((r) => r.api_name === 'BadAPI');
    expect(badResult.anomalyDetected).toBe(true);
    expect(badResult.reasonCodes).toContain('HTTP_5XX');
    expect(badResult.severity).toBe('critical');
  });

  test('handles partial batch failure gracefully', async () => {
    let callCount = 0;
    MonitoringCheck.mockImplementation(() => {
      const id = ++callCount;
      // Fail on the second item
      if (id === 2) {
        return { _id: `check-${id}`, save: jest.fn().mockRejectedValue(new Error('DB error')) };
      }
      return { _id: `check-${id}`, save: jest.fn().mockResolvedValue(undefined) };
    });

    const res = await request(app)
      .post('/api/v1/monitor')
      .send([
        { api_name: 'GoodAPI', response_time_ms: 100, status_code: 200 },
        { api_name: 'FailAPI', response_time_ms: 100, status_code: 200 },
      ]);

    // Should still return 200 even if one item fails
    expect(res.statusCode).toBe(200);
    expect(res.body.data.results).toHaveLength(2);
    // The failed item should have error field
    const failResult = res.body.data.results.find((r) => r.api_name === 'FailAPI');
    expect(failResult.error).toBeDefined();
  });

  test('auto-derives success from status_code when not provided', async () => {
    buildCheckMock('check-derived');

    const res = await request(app)
      .post('/api/v1/monitor')
      .send({
        api_name: 'DerivedAPI',
        response_time_ms: 100,
        status_code: 201,
        // success NOT provided
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.results[0].anomalyDetected).toBe(false);
  });

  describe('GET /api/v1/monitor/history', () => {
    test('returns paginated list of monitoring checks', async () => {
      const mockChecks = [
        { _id: 'c1', apiName: 'TestAPI', statusCode: 200, responseTimeMs: 150 },
        { _id: 'c2', apiName: 'TestAPI', statusCode: 500, responseTimeMs: 6000 },
      ];

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockChecks),
      };

      MonitoringCheck.find = jest.fn().mockReturnValue(mockFind);
      MonitoringCheck.countDocuments = jest.fn().mockResolvedValue(2);

      const res = await request(app).get('/api/v1/monitor/history?api_name=TestAPI&page=1&limit=20');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checks).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
    });
  });
});
