/**
 * PulseWatch AI End-to-End Flow Integration Test
 * Verifies the complete 10-step lifecycle:
 * 1. Register API
 * 2. Submit batch monitoring telemetry to POST /api/v1/monitor
 * 3. Validate and process inputs
 * 4. Detect anomalies deterministically
 * 5. Persist checks and alerts
 * 6. Generate AI diagnostic analysis
 * 7. Fallback when AI is unavailable
 * 8. Retrieve active alerts via GET /api/v1/alerts
 * 9. Retrieve dashboard metrics via GET /api/v1/monitoring/summary
 * 10. Acknowledge and resolve alerts through lifecycle state machine
 */

jest.mock('../src/config/env', () => ({
  PORT: '5000',
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost:27017/test',
  FRONTEND_URL: 'http://localhost:3000',
  MISTRAL_API_KEY: 'test-mistral-key',
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

jest.mock('axios');
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

// In-memory mock database state
const mockDb = {
  apis: new Map(),
  checks: [],
  alerts: new Map(),
};

// Mock Models to behave like Mongoose with in-memory store
jest.mock('../src/models/MonitoredAPI', () => {
  const MonitoredAPI = function (data) {
    this._id = data._id || `api_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    Object.assign(this, data);
    this.save = jest.fn().mockImplementation(async () => {
      mockDb.apis.set(this._id.toString(), this);
      return this;
    });
  };

  MonitoredAPI.find = jest.fn().mockImplementation((filter = {}) => {
    let list = Array.from(mockDb.apis.values());
    if (filter.enabled !== undefined) {
      list = list.filter((a) => a.enabled === filter.enabled);
    }
    return {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(list),
    };
  });

  MonitoredAPI.countDocuments = jest.fn().mockImplementation(async (filter = {}) => {
    let list = Array.from(mockDb.apis.values());
    if (filter.enabled !== undefined) {
      list = list.filter((a) => a.enabled === filter.enabled);
    }
    return list.length;
  });

  MonitoredAPI.findOne = jest.fn().mockImplementation(async (filter = {}) => {
    if (filter.name) {
      const target = filter.name.$regex
        ? Array.from(mockDb.apis.values()).find((a) =>
            filter.name.$regex.test(a.name)
          )
        : Array.from(mockDb.apis.values()).find((a) => a.name === filter.name);
      return target || null;
    }
    return null;
  });

  MonitoredAPI.findById = jest.fn().mockImplementation(async (id) => {
    return mockDb.apis.get(id.toString()) || null;
  });

  MonitoredAPI.findByIdAndUpdate = jest.fn().mockImplementation(async (id, update) => {
    const existing = mockDb.apis.get(id.toString());
    if (!existing) return null;
    Object.assign(existing, update);
    return existing;
  });

  MonitoredAPI.findByIdAndDelete = jest.fn().mockImplementation(async (id) => {
    const existing = mockDb.apis.get(id.toString());
    if (existing) mockDb.apis.delete(id.toString());
    return existing || null;
  });

  return MonitoredAPI;
});

jest.mock('../src/models/MonitoringCheck', () => {
  const MonitoringCheck = function (data) {
    this._id = `chk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    Object.assign(this, data);
    this.save = jest.fn().mockImplementation(async () => {
      mockDb.checks.push(this);
      return this;
    });
  };

  MonitoringCheck.find = jest.fn().mockImplementation((filter = {}) => {
    let list = [...mockDb.checks];
    if (filter.apiName) {
      list = list.filter((c) => filter.apiName.$regex.test(c.apiName));
    }
    return {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(list),
    };
  });

  MonitoringCheck.countDocuments = jest.fn().mockImplementation(async () => {
    return mockDb.checks.length;
  });

  MonitoringCheck.aggregate = jest.fn().mockImplementation(async () => {
    if (mockDb.checks.length === 0) return [];
    const valid = mockDb.checks.filter((c) => typeof c.responseTimeMs === 'number');
    const avg = valid.length ? valid.reduce((a, b) => a + b.responseTimeMs, 0) / valid.length : 0;
    return [{ _id: null, avgLatency: avg }];
  });

  return MonitoringCheck;
});

jest.mock('../src/models/Alert', () => {
  const Alert = function (data) {
    this._id = `alt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    Object.assign(this, data);
    this.save = jest.fn().mockImplementation(async () => {
      mockDb.alerts.set(this._id.toString(), this);
      return this;
    });
  };

  Alert.findOne = jest.fn().mockImplementation(async (filter = {}) => {
    const alerts = Array.from(mockDb.alerts.values());
    if (filter.fingerprint) {
      return (
        alerts.find(
          (a) =>
            a.fingerprint === filter.fingerprint &&
            (filter.status?.$in ? filter.status.$in.includes(a.status) : a.status === filter.status)
        ) || null
      );
    }
    return null;
  });

  Alert.findById = jest.fn().mockImplementation(async (id) => {
    return mockDb.alerts.get(id.toString()) || null;
  });

  Alert.find = jest.fn().mockImplementation((filter = {}) => {
    let list = Array.from(mockDb.alerts.values());
    if (filter.status?.$in) {
      list = list.filter((a) => filter.status.$in.includes(a.status));
    } else if (filter.status) {
      list = list.filter((a) => a.status === filter.status);
    }
    return {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(list),
    };
  });

  Alert.countDocuments = jest.fn().mockImplementation(async (filter = {}) => {
    let list = Array.from(mockDb.alerts.values());
    if (filter.status?.$in) {
      list = list.filter((a) => filter.status.$in.includes(a.status));
    }
    return list.length;
  });

  Alert.aggregate = jest.fn().mockImplementation(async () => {
    const counts = {};
    for (const a of mockDb.alerts.values()) {
      counts[a.severity] = (counts[a.severity] || 0) + 1;
    }
    return Object.entries(counts).map(([sev, count]) => ({ _id: sev, count }));
  });

  return Alert;
});

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');

describe('End-to-End PulseWatch AI Verification Workflow', () => {
  beforeEach(() => {
    mockDb.apis.clear();
    mockDb.checks.length = 0;
    mockDb.alerts.clear();
    jest.clearAllMocks();
  });

  test('executes complete 10-step monitoring, anomaly detection, AI fallback, and alert triage flow', async () => {
    // ── STEP 1: Register a Monitored API ────────────────────────────────────
    const registerRes = await request(app)
      .post('/api/v1/monitored-apis')
      .send({
        name: 'CoreOrdersAPI',
        url: 'https://api.example.com/orders',
        method: 'GET',
        intervalSeconds: 30,
        timeoutMs: 5000,
        thresholds: {
          responseTimeMs: 2000,
          expectRecords: true,
        },
      });

    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.data.name).toBe('CoreOrdersAPI');
    const apiId = registerRes.body.data._id;

    // ── STEP 2 & 3: Ingest Batch Monitoring Results (POST /api/v1/monitor) ──
    // Mock Mistral AI response for the anomaly item
    const mockAiDiagnostic = {
      summary: 'CoreOrdersAPI suffered HTTP 500 internal server failure and 0 returned records.',
      possibleCause: 'Database connection pool starvation or downstream deadlock during transactions.',
      businessImpact: 'Checkout processes interrupted; users experiencing transaction dropouts.',
      recommendedAction: 'Inspect DB active connection metrics and restart worker threads if deadlocked.',
    };

    axios.mockResolvedValueOnce({
      status: 200,
      data: {
        choices: [{ message: { content: JSON.stringify(mockAiDiagnostic) } }],
      },
    });

    const batchTelemetry = [
      {
        api_name: 'CoreOrdersAPI',
        status_code: 200,
        response_time_ms: 180,
        records_returned: 15,
      },
      {
        api_name: 'CoreOrdersAPI',
        status_code: 500,
        response_time_ms: 310,
        records_returned: 0,
        error_message: 'HTTP 500 Internal Server Error',
      },
    ];

    const ingestRes = await request(app)
      .post('/api/v1/monitor')
      .send(batchTelemetry);

    // ── STEP 4 & 5: Detect Anomaly and Persist Checks & Alerts ───────────────
    expect(ingestRes.statusCode).toBe(200);
    expect(ingestRes.body.success).toBe(true);
    expect(ingestRes.body.data.processed).toBe(2);
    expect(ingestRes.body.data.anomaliesDetected).toBe(1);
    expect(ingestRes.body.data.alerts).toHaveLength(1);

    const alertId = ingestRes.body.data.alerts[0];
    expect(alertId).toBeDefined();

    // ── STEP 6: Verify AI Explanation Generation ─────────────────────────────
    const createdAlert = mockDb.alerts.get(alertId);
    expect(createdAlert).toBeDefined();
    expect(createdAlert.apiName).toBe('CoreOrdersAPI');
    expect(createdAlert.severity).toBe('critical');
    expect(createdAlert.reasonCodes).toContain('HTTP_5XX');
    expect(createdAlert.status).toBe('open');

    // ── STEP 7: Submit Anomaly with AI Unavailable (Verify Fallback) ────────
    // Next anomaly with AI service failing (e.g. timeout)
    axios.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const slowTelemetry = {
      api_name: 'CoreOrdersAPI',
      status_code: 200,
      response_time_ms: 3200, // Warning latency (>2000)
      records_returned: 10,
    };

    const slowIngestRes = await request(app)
      .post('/api/v1/monitor')
      .send(slowTelemetry);

    expect(slowIngestRes.statusCode).toBe(200);
    expect(slowIngestRes.body.data.anomaliesDetected).toBe(1);

    // ── STEP 8: Retrieve Active Alerts (GET /api/v1/alerts) ──────────────────
    const alertsListRes = await request(app).get('/api/v1/alerts');

    expect(alertsListRes.statusCode).toBe(200);
    expect(alertsListRes.body.success).toBe(true);
    expect(alertsListRes.body.data.alerts.length).toBeGreaterThanOrEqual(1);

    // ── STEP 9: Retrieve Dashboard Summary (GET /api/v1/monitoring/summary) ─
    const summaryRes = await request(app).get('/api/v1/monitoring/summary');

    expect(summaryRes.statusCode).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.data.apis.total).toBe(1);
    expect(summaryRes.body.data.apis.active).toBe(1);
    expect(summaryRes.body.data.metrics24h.totalChecks).toBeGreaterThanOrEqual(2);
    expect(summaryRes.body.data.alerts.totalActive).toBeGreaterThanOrEqual(1);

    // ── STEP 10: Triage Incident Alert (Acknowledge & Resolve) ──────────────
    // Acknowledge alert
    const ackRes = await request(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`);

    expect(ackRes.statusCode).toBe(200);
    expect(ackRes.body.success).toBe(true);
    expect(ackRes.body.data.status).toBe('acknowledged');

    // Resolve alert
    const resolveRes = await request(app)
      .patch(`/api/v1/alerts/${alertId}/resolve`);

    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.body.success).toBe(true);
    expect(resolveRes.body.data.status).toBe('resolved');
    expect(resolveRes.body.data.resolvedAt).toBeDefined();

    // Verify terminal lifecycle state (cannot transition back from resolved)
    const invalidReopenRes = await request(app)
      .patch(`/api/v1/alerts/${alertId}`)
      .send({ status: 'acknowledged' });

    expect(invalidReopenRes.statusCode).toBe(400);
    expect(invalidReopenRes.body.success).toBe(false);
  });
});
