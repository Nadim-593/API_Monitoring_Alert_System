/**
 * Anomaly Detection Service
 * Deterministic rule-based anomaly detection for API monitoring checks.
 * No LLM dependency — pure logic based on configurable thresholds.
 */

// Default thresholds (overridden per-API via thresholds config)
const DEFAULTS = {
  warnLatencyMs: 2000,
  criticalLatencyMs: 5000,
  errorRatePercent: 10,
  consecutiveFailures: 3,
  expectRecords: false, // zero records only flagged if true
};

/** Severity ordering for precedence (higher index = higher severity) */
const SEVERITY_ORDER = ['low', 'warning', 'medium', 'high', 'critical'];

/**
 * Return the highest-precedence severity from a list.
 * @param {string[]} severities
 * @returns {string|null}
 */
function highestSeverity(severities) {
  if (!severities || severities.length === 0) return null;
  return severities.reduce((best, current) => {
    const bestIdx = SEVERITY_ORDER.indexOf(best);
    const currIdx = SEVERITY_ORDER.indexOf(current);
    return currIdx > bestIdx ? current : best;
  });
}

/**
 * Analyze a single check payload and return anomaly results.
 *
 * @param {object} checkData - The check data
 *   { responseTimeMs, statusCode, recordsReturned, success, errorMessage }
 * @param {object} apiConfig - The MonitoredAPI document (thresholds, name, etc.)
 * @returns {{ anomalyDetected: boolean, reasonCodes: string[], severity: string|null, details: string }}
 */
function detectAnomalies(checkData, apiConfig = {}) {
  const { responseTimeMs, statusCode, recordsReturned, success, errorMessage } = checkData;

  const thresholds = apiConfig.thresholds || {};
  const warnLatencyMs = thresholds.responseTimeMs || DEFAULTS.warnLatencyMs;
  const criticalLatencyMs =
    thresholds.criticalLatencyMs || DEFAULTS.criticalLatencyMs;
  const expectRecords =
    thresholds.expectRecords !== undefined
      ? thresholds.expectRecords
      : DEFAULTS.expectRecords;

  const reasonCodes = [];
  const severities = [];
  const detailParts = [];

  // ── 1. INVALID_DATA ───────────────────────────────────────────────────────
  const invalidResponseTime =
    responseTimeMs === null ||
    responseTimeMs === undefined ||
    typeof responseTimeMs !== 'number' ||
    responseTimeMs < 0;
  const invalidStatusCode =
    statusCode === null ||
    statusCode === undefined ||
    typeof statusCode !== 'number';

  if (invalidResponseTime || invalidStatusCode) {
    reasonCodes.push('INVALID_DATA');
    severities.push('medium');
    const parts = [];
    if (invalidResponseTime) parts.push(`responseTimeMs is invalid (${responseTimeMs})`);
    if (invalidStatusCode) parts.push(`statusCode is invalid (${statusCode})`);
    detailParts.push(parts.join('; '));
  }

  // ── 2. REQUEST_TIMEOUT ────────────────────────────────────────────────────
  if (
    success === false &&
    errorMessage &&
    /ETIMEDOUT|ECONNABORTED|timeout/i.test(errorMessage)
  ) {
    reasonCodes.push('REQUEST_TIMEOUT');
    severities.push('high');
    detailParts.push(`Request timed out: ${errorMessage}`);
  }

  // ── 3. NETWORK_ERROR ──────────────────────────────────────────────────────
  if (
    success === false &&
    errorMessage &&
    /ECONNREFUSED|ENOTFOUND|ECONNRESET|network/i.test(errorMessage)
  ) {
    reasonCodes.push('NETWORK_ERROR');
    severities.push('high');
    detailParts.push(`Network error: ${errorMessage}`);
  }

  // ── 4 & 5. HTTP Status Errors ─────────────────────────────────────────────
  // Only check if statusCode is valid
  if (typeof statusCode === 'number') {
    if (statusCode >= 500) {
      // HTTP_5XX — critical
      reasonCodes.push('HTTP_5XX');
      severities.push('critical');
      detailParts.push(`HTTP ${statusCode} server error detected`);
    } else if (statusCode >= 400 && statusCode < 500) {
      // HTTP_4XX — medium by default; 401/403 are low (auth issues, not outages)
      const sev = statusCode === 401 || statusCode === 403 ? 'low' : 'medium';
      reasonCodes.push('HTTP_4XX');
      severities.push(sev);
      detailParts.push(`HTTP ${statusCode} client error detected`);
    }
  }

  // ── 6. HIGH_LATENCY ───────────────────────────────────────────────────────
  // Only check if responseTimeMs is valid (non-negative number)
  if (
    typeof responseTimeMs === 'number' &&
    responseTimeMs >= 0 &&
    !invalidResponseTime
  ) {
    if (responseTimeMs > criticalLatencyMs) {
      reasonCodes.push('HIGH_LATENCY');
      severities.push('high');
      detailParts.push(
        `Response time ${responseTimeMs}ms exceeds critical threshold ${criticalLatencyMs}ms`
      );
    } else if (responseTimeMs > warnLatencyMs) {
      reasonCodes.push('HIGH_LATENCY');
      severities.push('warning');
      detailParts.push(
        `Response time ${responseTimeMs}ms exceeds warning threshold ${warnLatencyMs}ms`
      );
    }
  }

  // ── 7. ZERO_RECORDS ───────────────────────────────────────────────────────
  if (
    expectRecords === true &&
    recordsReturned === 0 &&
    typeof statusCode === 'number' &&
    statusCode >= 200 &&
    statusCode < 300
  ) {
    reasonCodes.push('ZERO_RECORDS');
    severities.push('medium');
    detailParts.push('Expected records but API returned zero results');
  }

  // ── Compile result ────────────────────────────────────────────────────────
  const anomalyDetected = reasonCodes.length > 0;
  const severity = anomalyDetected ? highestSeverity(severities) : null;
  const details = detailParts.join('; ');

  return { anomalyDetected, reasonCodes, severity, details };
}

module.exports = { detectAnomalies, DEFAULTS };
