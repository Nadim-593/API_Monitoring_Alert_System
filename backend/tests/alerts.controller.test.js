/**
 * Tests for Alerts Controller and Lifecycle State Transitions
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

jest.mock('../src/models/Alert');
jest.mock('../src/models/MonitoringCheck');
jest.mock('../src/models/MonitoredAPI');

const Alert = require('../src/models/Alert');
const request = require('supertest');
const app = require('../src/app');

describe('Alerts Endpoints (/api/v1/alerts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /api/v1/alerts ────────────────────────────────────────────────────

  describe('GET /api/v1/alerts', () => {
    test('lists active alerts by default (open and acknowledged)', async () => {
      const mockAlerts = [
        { _id: 'a1', apiName: 'API 1', status: 'open', severity: 'critical' },
        { _id: 'a2', apiName: 'API 2', status: 'acknowledged', severity: 'high' },
      ];

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockAlerts),
      };

      Alert.find = jest.fn().mockReturnValue(mockFind);
      Alert.countDocuments = jest.fn().mockResolvedValue(2);

      const res = await request(app).get('/api/v1/alerts');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alerts).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(Alert.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $in: ['open', 'acknowledged'] },
        })
      );
    });

    test('supports status=all to retrieve all alerts including resolved', async () => {
      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };

      Alert.find = jest.fn().mockReturnValue(mockFind);
      Alert.countDocuments = jest.fn().mockResolvedValue(0);

      const res = await request(app).get('/api/v1/alerts?status=all');

      expect(res.statusCode).toBe(200);
      expect(Alert.find).toHaveBeenCalledWith(
        expect.not.objectContaining({ status: expect.anything() })
      );
    });

    test('supports filtering by severity and apiName', async () => {
      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };

      Alert.find = jest.fn().mockReturnValue(mockFind);
      Alert.countDocuments = jest.fn().mockResolvedValue(0);

      const res = await request(app).get('/api/v1/alerts?severity=critical&apiName=PaymentAPI');

      expect(res.statusCode).toBe(200);
      expect(Alert.find).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'critical',
          apiName: expect.any(Object),
        })
      );
    });
  });

  // ── GET /api/v1/alerts/:id ────────────────────────────────────────────────

  describe('GET /api/v1/alerts/:id', () => {
    test('returns alert details when found', async () => {
      const mockAlert = {
        _id: 'alert-123',
        apiName: 'UsersAPI',
        severity: 'high',
        summary: 'High latency detected',
        status: 'open',
      };

      Alert.findById = jest.fn().mockResolvedValue(mockAlert);

      const res = await request(app).get('/api/v1/alerts/alert-123');

      expect(res.statusCode).toBe(200);
      expect(res.body.data._id).toBe('alert-123');
    });

    test('returns 404 if alert not found', async () => {
      Alert.findById = jest.fn().mockResolvedValue(null);

      const res = await request(app).get('/api/v1/alerts/nonexistent');

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ── PATCH /api/v1/alerts/:id (Lifecycle Transitions) ─────────────────────

  describe('PATCH /api/v1/alerts/:id', () => {
    test('transitions alert from open to acknowledged', async () => {
      const mockAlert = {
        _id: 'alert-1',
        status: 'open',
        save: jest.fn().mockResolvedValue(undefined),
      };

      Alert.findById = jest.fn().mockResolvedValue(mockAlert);

      const res = await request(app)
        .patch('/api/v1/alerts/alert-1')
        .send({ status: 'acknowledged' });

      expect(res.statusCode).toBe(200);
      expect(mockAlert.status).toBe('acknowledged');
      expect(mockAlert.acknowledgedAt).toBeInstanceOf(Date);
      expect(mockAlert.save).toHaveBeenCalled();
    });

    test('transitions alert from open to resolved', async () => {
      const mockAlert = {
        _id: 'alert-2',
        status: 'open',
        save: jest.fn().mockResolvedValue(undefined),
      };

      Alert.findById = jest.fn().mockResolvedValue(mockAlert);

      const res = await request(app)
        .patch('/api/v1/alerts/alert-2')
        .send({ status: 'resolved' });

      expect(res.statusCode).toBe(200);
      expect(mockAlert.status).toBe('resolved');
      expect(mockAlert.resolvedAt).toBeInstanceOf(Date);
      expect(mockAlert.save).toHaveBeenCalled();
    });

    test('transitions alert from acknowledged to resolved', async () => {
      const mockAlert = {
        _id: 'alert-3',
        status: 'acknowledged',
        save: jest.fn().mockResolvedValue(undefined),
      };

      Alert.findById = jest.fn().mockResolvedValue(mockAlert);

      const res = await request(app)
        .patch('/api/v1/alerts/alert-3')
        .send({ status: 'resolved' });

      expect(res.statusCode).toBe(200);
      expect(mockAlert.status).toBe('resolved');
      expect(mockAlert.resolvedAt).toBeInstanceOf(Date);
      expect(mockAlert.save).toHaveBeenCalled();
    });

    test('rejects transition from resolved to acknowledged (terminal state validation)', async () => {
      const mockAlert = {
        _id: 'alert-4',
        status: 'resolved',
        save: jest.fn(),
      };

      Alert.findById = jest.fn().mockResolvedValue(mockAlert);

      const res = await request(app)
        .patch('/api/v1/alerts/alert-4')
        .send({ status: 'acknowledged' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Cannot transition alert from 'resolved'");
      expect(mockAlert.save).not.toHaveBeenCalled();
    });

    test('rejects transition with invalid status value', async () => {
      const res = await request(app)
        .patch('/api/v1/alerts/alert-5')
        .send({ status: 'reopened' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('convenience endpoint /acknowledge updates status', async () => {
      const mockAlert = {
        _id: 'alert-6',
        status: 'open',
        save: jest.fn().mockResolvedValue(undefined),
      };

      Alert.findById = jest.fn().mockResolvedValue(mockAlert);

      const res = await request(app).patch('/api/v1/alerts/alert-6/acknowledge');

      expect(res.statusCode).toBe(200);
      expect(mockAlert.status).toBe('acknowledged');
    });

    test('convenience endpoint /resolve updates status', async () => {
      const mockAlert = {
        _id: 'alert-7',
        status: 'acknowledged',
        save: jest.fn().mockResolvedValue(undefined),
      };

      Alert.findById = jest.fn().mockResolvedValue(mockAlert);

      const res = await request(app).patch('/api/v1/alerts/alert-7/resolve');

      expect(res.statusCode).toBe(200);
      expect(mockAlert.status).toBe('resolved');
    });
  });
});
