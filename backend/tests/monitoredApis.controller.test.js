/**
 * Tests for MonitoredAPI CRUD endpoints and scheduler interaction.
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
jest.mock('../src/services/monitoringEngine', () => ({
  scheduleApi: jest.fn(),
  unscheduleApi: jest.fn(),
  initializeScheduler: jest.fn(),
  stopAllSchedules: jest.fn(),
  executeCheck: jest.fn(),
  isBlockedUrl: jest.fn(),
}));

const MonitoredAPI = require('../src/models/MonitoredAPI');
const { scheduleApi, unscheduleApi } = require('../src/services/monitoringEngine');
const request = require('supertest');
const app = require('../src/app');

describe('MonitoredAPI Endpoints (/api/v1/monitored-apis)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/monitored-apis', () => {
    test('creates a valid API and schedules it if enabled', async () => {
      const mockApi = {
        _id: '507f1f77bcf86cd799439011',
        name: 'PatientDataAPI',
        url: 'https://api.example.com/patients',
        method: 'GET',
        enabled: true,
        intervalSeconds: 60,
        timeoutMs: 5000,
        save: jest.fn().mockResolvedValue(undefined),
      };

      MonitoredAPI.mockImplementation(() => mockApi);

      const res = await request(app)
        .post('/api/v1/monitored-apis')
        .send({
          name: 'PatientDataAPI',
          url: 'https://api.example.com/patients',
          method: 'GET',
          enabled: true,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockApi.save).toHaveBeenCalled();
      expect(scheduleApi).toHaveBeenCalledWith(mockApi);
    });

    test('returns 400 for invalid input (bad URL, missing name)', async () => {
      const res = await request(app)
        .post('/api/v1/monitored-apis')
        .send({
          name: '',
          url: 'not-a-valid-url',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
    });
  });

  describe('GET /api/v1/monitored-apis', () => {
    test('returns list of APIs with pagination', async () => {
      const mockList = [
        { _id: '1', name: 'API 1', url: 'https://example.com/1', enabled: true },
        { _id: '2', name: 'API 2', url: 'https://example.com/2', enabled: false },
      ];

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockList),
      };

      MonitoredAPI.find = jest.fn().mockReturnValue(mockFind);
      MonitoredAPI.countDocuments = jest.fn().mockResolvedValue(2);

      const res = await request(app).get('/api/v1/monitored-apis?page=1&limit=20');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.apis).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.pagination.page).toBe(1);
    });

    test('supports filtering by enabled=true', async () => {
      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };

      MonitoredAPI.find = jest.fn().mockReturnValue(mockFind);
      MonitoredAPI.countDocuments = jest.fn().mockResolvedValue(0);

      const res = await request(app).get('/api/v1/monitored-apis?enabled=true');

      expect(res.statusCode).toBe(200);
      expect(MonitoredAPI.find).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });
  });

  describe('GET /api/v1/monitored-apis/:id', () => {
    test('returns API by id if found', async () => {
      const mockApi = { _id: 'api-123', name: 'FoundAPI' };
      MonitoredAPI.findById = jest.fn().mockResolvedValue(mockApi);

      const res = await request(app).get('/api/v1/monitored-apis/api-123');

      expect(res.statusCode).toBe(200);
      expect(res.body.data._id).toBe('api-123');
    });

    test('returns 404 if API not found', async () => {
      MonitoredAPI.findById = jest.fn().mockResolvedValue(null);

      const res = await request(app).get('/api/v1/monitored-apis/non-existent');

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/monitored-apis/:id', () => {
    test('updates API and reschedules if enabled', async () => {
      const updatedApi = {
        _id: 'api-123',
        name: 'UpdatedName',
        enabled: true,
      };

      MonitoredAPI.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedApi);

      const res = await request(app)
        .put('/api/v1/monitored-apis/api-123')
        .send({ name: 'UpdatedName' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('UpdatedName');
      expect(scheduleApi).toHaveBeenCalledWith(updatedApi);
    });

    test('returns 404 on update if API not found', async () => {
      MonitoredAPI.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

      const res = await request(app)
        .put('/api/v1/monitored-apis/api-123')
        .send({ name: 'UpdatedName' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/monitored-apis/:id', () => {
    test('deletes API and unschedules it', async () => {
      MonitoredAPI.findByIdAndDelete = jest.fn().mockResolvedValue({ _id: 'api-123' });

      const res = await request(app).delete('/api/v1/monitored-apis/api-123');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(unscheduleApi).toHaveBeenCalledWith('api-123');
    });

    test('returns 404 on delete if not found', async () => {
      MonitoredAPI.findByIdAndDelete = jest.fn().mockResolvedValue(null);

      const res = await request(app).delete('/api/v1/monitored-apis/api-123');

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/monitored-apis/:id/toggle', () => {
    test('toggles enabled status from false to true and schedules', async () => {
      const mockApi = {
        _id: 'api-123',
        enabled: false,
        save: jest.fn().mockResolvedValue(undefined),
      };
      MonitoredAPI.findById = jest.fn().mockResolvedValue(mockApi);

      const res = await request(app).patch('/api/v1/monitored-apis/api-123/toggle');

      expect(res.statusCode).toBe(200);
      expect(mockApi.enabled).toBe(true);
      expect(scheduleApi).toHaveBeenCalledWith(mockApi);
    });

    test('toggles enabled status from true to false and unschedules', async () => {
      const mockApi = {
        _id: 'api-123',
        enabled: true,
        save: jest.fn().mockResolvedValue(undefined),
      };
      MonitoredAPI.findById = jest.fn().mockResolvedValue(mockApi);

      const res = await request(app).patch('/api/v1/monitored-apis/api-123/toggle');

      expect(res.statusCode).toBe(200);
      expect(mockApi.enabled).toBe(false);
      expect(unscheduleApi).toHaveBeenCalledWith('api-123');
    });
  });
});
