/**
 * Tests for the Alert Service.
 * Mocks the Alert mongoose model to avoid DB dependency.
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

// Mock the Alert model
jest.mock('../src/models/Alert');
jest.mock('../src/models/MonitoringCheck', () => ({
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue([]),
  }),
}));
// Mock logger to silence output
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const Alert = require('../src/models/Alert');
const { generateFingerprint, createOrUpdateAlert } = require('../src/services/alertService');

describe('Alert Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Fingerprint ───────────────────────────────────────────────────────────

  test('generateFingerprint returns stable hash for same inputs', () => {
    const fp1 = generateFingerprint('api-123', 'HTTP_5XX');
    const fp2 = generateFingerprint('api-123', 'HTTP_5XX');
    expect(fp1).toBe(fp2);
    expect(typeof fp1).toBe('string');
    expect(fp1).toHaveLength(32);
  });

  test('generateFingerprint returns different hash for different inputs', () => {
    const fp1 = generateFingerprint('api-123', 'HTTP_5XX');
    const fp2 = generateFingerprint('api-456', 'HTTP_5XX');
    const fp3 = generateFingerprint('api-123', 'NETWORK_ERROR');
    expect(fp1).not.toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });

  // ── createOrUpdateAlert ───────────────────────────────────────────────────

  test('createOrUpdateAlert creates new alert when none exists', async () => {
    const mockSave = jest.fn().mockResolvedValue(undefined);
    const mockAlertInstance = {
      _id: 'alert-id-new',
      save: mockSave,
    };

    // findOne returns null → no existing alert
    Alert.findOne = jest.fn().mockResolvedValue(null);
    // Alert constructor returns mock instance
    Alert.mockImplementation(() => mockAlertInstance);

    const result = await createOrUpdateAlert({
      apiId: 'api-123',
      apiName: 'TestAPI',
      severity: 'critical',
      reasonCodes: ['HTTP_5XX'],
      summary: 'HTTP 500 error detected',
    });

    expect(Alert.findOne).toHaveBeenCalledWith({
      fingerprint: expect.any(String),
      status: { $in: ['open', 'acknowledged'] },
    });
    expect(mockSave).toHaveBeenCalled();
    expect(result.isNew).toBe(true);
    expect(result.alert).toBe(mockAlertInstance);
  });

  test('createOrUpdateAlert updates existing open alert (deduplication)', async () => {
    const mockSave = jest.fn().mockResolvedValue(undefined);
    const existingAlert = {
      _id: 'alert-id-existing',
      status: 'open',
      severity: 'medium',
      occurrenceCount: 2,
      lastSeenAt: new Date('2026-01-01'),
      save: mockSave,
    };

    Alert.findOne = jest.fn().mockResolvedValue(existingAlert);

    const result = await createOrUpdateAlert({
      apiId: 'api-123',
      apiName: 'TestAPI',
      severity: 'critical',
      reasonCodes: ['HTTP_5XX'],
      summary: 'HTTP 500 error detected',
    });

    expect(result.isNew).toBe(false);
    expect(result.alert).toBe(existingAlert);
    // occurrence count should be incremented
    expect(existingAlert.occurrenceCount).toBe(3);
    // lastSeenAt should be updated
    expect(existingAlert.lastSeenAt).not.toEqual(new Date('2026-01-01'));
    // severity should be escalated to critical
    expect(existingAlert.severity).toBe('critical');
    expect(mockSave).toHaveBeenCalled();
  });

  test('createOrUpdateAlert creates new alert when previous is resolved', async () => {
    // findOne returns null because resolved alerts are excluded from the query
    Alert.findOne = jest.fn().mockResolvedValue(null);

    const mockSave = jest.fn().mockResolvedValue(undefined);
    const mockAlertInstance = {
      _id: 'alert-id-new2',
      save: mockSave,
    };
    Alert.mockImplementation(() => mockAlertInstance);

    const result = await createOrUpdateAlert({
      apiId: 'api-999',
      apiName: 'ResolvedAPI',
      severity: 'high',
      reasonCodes: ['NETWORK_ERROR'],
      summary: 'Network error detected',
    });

    expect(result.isNew).toBe(true);
    expect(mockSave).toHaveBeenCalled();
  });
});
