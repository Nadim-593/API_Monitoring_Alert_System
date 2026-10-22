/**
 * Tests for the Anomaly Detector service.
 * Pure unit tests — no DB or network calls.
 */
const { detectAnomalies, DEFAULTS } = require('../src/services/anomalyDetector');

describe('Anomaly Detector', () => {
  // ── Healthy response ──────────────────────────────────────────────────────

  test('healthy 200 response with fast response time → no anomaly', () => {
    const result = detectAnomalies(
      { responseTimeMs: 150, statusCode: 200, success: true, errorMessage: null, recordsReturned: null },
      {}
    );
    expect(result.anomalyDetected).toBe(false);
    expect(result.reasonCodes).toHaveLength(0);
    expect(result.severity).toBeNull();
    expect(result.details).toBe('');
  });

  // ── Latency tests ─────────────────────────────────────────────────────────

  test('response time > warnLatencyMs → HIGH_LATENCY warning', () => {
    const result = detectAnomalies(
      { responseTimeMs: 3000, statusCode: 200, success: true, errorMessage: null, recordsReturned: null },
      { thresholds: { responseTimeMs: 2000 } }
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('HIGH_LATENCY');
    expect(result.severity).toBe('warning');
  });

  test('response time > criticalLatencyMs → HIGH_LATENCY high severity', () => {
    const result = detectAnomalies(
      { responseTimeMs: 6000, statusCode: 200, success: true, errorMessage: null, recordsReturned: null },
      { thresholds: { responseTimeMs: 2000, criticalLatencyMs: 5000 } }
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('HIGH_LATENCY');
    expect(result.severity).toBe('high');
  });

  // ── HTTP error tests ──────────────────────────────────────────────────────

  test('status_code 500 → HTTP_5XX critical', () => {
    const result = detectAnomalies(
      { responseTimeMs: 100, statusCode: 500, success: false, errorMessage: null, recordsReturned: null },
      {}
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('HTTP_5XX');
    expect(result.severity).toBe('critical');
  });

  test('status_code 404 → HTTP_4XX medium', () => {
    const result = detectAnomalies(
      { responseTimeMs: 100, statusCode: 404, success: false, errorMessage: null, recordsReturned: null },
      {}
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('HTTP_4XX');
    expect(result.severity).toBe('medium');
  });

  test('status_code 401 → HTTP_4XX low severity', () => {
    const result = detectAnomalies(
      { responseTimeMs: 100, statusCode: 401, success: false, errorMessage: null, recordsReturned: null },
      {}
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('HTTP_4XX');
    expect(result.severity).toBe('low');
  });

  // ── Network / timeout tests ───────────────────────────────────────────────

  test('success=false with ETIMEDOUT message → REQUEST_TIMEOUT', () => {
    const result = detectAnomalies(
      { responseTimeMs: 10000, statusCode: null, success: false, errorMessage: 'ETIMEDOUT', recordsReturned: null },
      {}
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('REQUEST_TIMEOUT');
  });

  test('success=false with ECONNREFUSED message → NETWORK_ERROR', () => {
    const result = detectAnomalies(
      { responseTimeMs: 10, statusCode: null, success: false, errorMessage: 'connect ECONNREFUSED 127.0.0.1:3000', recordsReturned: null },
      {}
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('NETWORK_ERROR');
  });

  // ── Zero records ──────────────────────────────────────────────────────────

  test('zero records with expectRecords=false → no ZERO_RECORDS anomaly', () => {
    const result = detectAnomalies(
      { responseTimeMs: 100, statusCode: 200, success: true, errorMessage: null, recordsReturned: 0 },
      { thresholds: { expectRecords: false } }
    );
    expect(result.reasonCodes).not.toContain('ZERO_RECORDS');
  });

  test('zero records with expectRecords=true → ZERO_RECORDS medium', () => {
    const result = detectAnomalies(
      { responseTimeMs: 100, statusCode: 200, success: true, errorMessage: null, recordsReturned: 0 },
      { thresholds: { expectRecords: true } }
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('ZERO_RECORDS');
    expect(result.severity).toBe('medium');
  });

  test('nonzero records with expectRecords=true → no anomaly', () => {
    const result = detectAnomalies(
      { responseTimeMs: 100, statusCode: 200, success: true, errorMessage: null, recordsReturned: 5 },
      { thresholds: { expectRecords: true } }
    );
    expect(result.reasonCodes).not.toContain('ZERO_RECORDS');
  });

  // ── Invalid data ──────────────────────────────────────────────────────────

  test('negative responseTimeMs → INVALID_DATA', () => {
    const result = detectAnomalies(
      { responseTimeMs: -1, statusCode: 200, success: true, errorMessage: null, recordsReturned: null },
      {}
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('INVALID_DATA');
  });

  test('null statusCode → INVALID_DATA', () => {
    const result = detectAnomalies(
      { responseTimeMs: 100, statusCode: null, success: false, errorMessage: null, recordsReturned: null },
      {}
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('INVALID_DATA');
  });

  // ── Multiple anomalies ────────────────────────────────────────────────────

  test('500 error with slow response → both HTTP_5XX and HIGH_LATENCY, severity=critical', () => {
    const result = detectAnomalies(
      { responseTimeMs: 6000, statusCode: 500, success: false, errorMessage: null, recordsReturned: null },
      { thresholds: { responseTimeMs: 2000, criticalLatencyMs: 5000 } }
    );
    expect(result.anomalyDetected).toBe(true);
    expect(result.reasonCodes).toContain('HTTP_5XX');
    expect(result.reasonCodes).toContain('HIGH_LATENCY');
    expect(result.severity).toBe('critical');
  });

  // ── Severity precedence ───────────────────────────────────────────────────

  test('severity precedence: critical > high > medium > warning', () => {
    // HTTP 5xx (critical) + high latency (high) → should be critical
    const r1 = detectAnomalies(
      { responseTimeMs: 6000, statusCode: 500, success: false, errorMessage: null, recordsReturned: null },
      { thresholds: { responseTimeMs: 2000, criticalLatencyMs: 5000 } }
    );
    expect(r1.severity).toBe('critical');

    // High latency critical (high) → should be high
    const r2 = detectAnomalies(
      { responseTimeMs: 6000, statusCode: 200, success: true, errorMessage: null, recordsReturned: null },
      { thresholds: { responseTimeMs: 2000, criticalLatencyMs: 5000 } }
    );
    expect(r2.severity).toBe('high');

    // 404 (medium) + zero records (medium) → medium
    const r3 = detectAnomalies(
      { responseTimeMs: 100, statusCode: 404, success: false, errorMessage: null, recordsReturned: 0 },
      { thresholds: { expectRecords: true } }
    );
    // 404 is not 2xx so ZERO_RECORDS won't trigger; only HTTP_4XX → medium
    expect(r3.severity).toBe('medium');

    // Warning latency only → warning
    const r4 = detectAnomalies(
      { responseTimeMs: 3000, statusCode: 200, success: true, errorMessage: null, recordsReturned: null },
      { thresholds: { responseTimeMs: 2000 } }
    );
    expect(r4.severity).toBe('warning');
  });
});
