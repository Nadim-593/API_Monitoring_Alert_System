/**
 * Alert Service
 * Handles alert creation, AI enrichment via Mistral, deduplication via fingerprinting,
 * persistence, and validated lifecycle transitions.
 */
const crypto = require('crypto');
const Alert = require('../models/Alert');
const MonitoringCheck = require('../models/MonitoringCheck');
const { analyzeAnomaly } = require('./mistralService');
const logger = require('../config/logger');

/**
 * Generate a stable fingerprint for deduplication.
 * Based on: apiIdentifier + primary reason code (first in list).
 *
 * @param {string} apiIdentifier - API ID or API name string
 * @param {string} primaryReasonCode - The first/primary reason code
 * @returns {string} 32-character hex fingerprint
 */
function generateFingerprint(apiIdentifier, primaryReasonCode) {
  return crypto
    .createHash('sha256')
    .update(`${apiIdentifier}:${primaryReasonCode}`)
    .digest('hex')
    .substring(0, 32);
}

/**
 * Create or update an alert (upsert by fingerprint).
 * - If an open/acknowledged alert with this fingerprint exists → update lastSeenAt, increment occurrenceCount
 * - If no open alert → create new alert with AI/fallback diagnostic analysis
 *
 * @param {object} alertData
 * @param {string|null} alertData.apiId
 * @param {string} alertData.apiName
 * @param {string} alertData.severity
 * @param {string[]} alertData.reasonCodes
 * @param {string} alertData.summary
 * @param {string|null} [alertData.possibleCause]
 * @param {string|null} [alertData.businessImpact]
 * @param {string|null} [alertData.recommendedAction]
 * @param {object} [alertData.metricsSnapshot]
 * @param {boolean} [alertData.expectRecords]
 * @returns {Promise<{ alert: object, isNew: boolean }>}
 */
async function createOrUpdateAlert(alertData) {
  const { apiId, apiName, severity, reasonCodes, summary } = alertData;

  const primaryReasonCode = reasonCodes && reasonCodes.length > 0 ? reasonCodes[0] : 'UNKNOWN';
  const identifier = apiId ? apiId.toString() : apiName;
  const fingerprint = generateFingerprint(identifier, primaryReasonCode);

  try {
    // Look for an existing open or acknowledged alert with same fingerprint
    const existingAlert = await Alert.findOne({
      fingerprint,
      status: { $in: ['open', 'acknowledged'] },
    });

    if (existingAlert) {
      // Deduplicate — update lastSeenAt and bump count
      existingAlert.lastSeenAt = new Date();
      existingAlert.occurrenceCount = (existingAlert.occurrenceCount || 1) + 1;

      // Update severity if new one is more critical
      const SEVERITY_ORDER = ['low', 'warning', 'medium', 'high', 'critical'];
      const existingIdx = SEVERITY_ORDER.indexOf(existingAlert.severity);
      const newIdx = SEVERITY_ORDER.indexOf(severity);
      if (newIdx > existingIdx) {
        existingAlert.severity = severity;
      }

      await existingAlert.save();
      logger.info(
        { fingerprint, alertId: existingAlert._id },
        'Alert deduplicated — updated existing alert'
      );
      return { alert: existingAlert, isNew: false };
    }

    // New alert — generate diagnostic analysis if not explicitly supplied
    let analysis = {
      summary: summary || `Anomaly detected for ${apiName}`,
      possibleCause: alertData.possibleCause || null,
      businessImpact: alertData.businessImpact || null,
      recommendedAction: alertData.recommendedAction || null,
      aiGenerated: false,
      generationMethod: 'fallback',
      aiGenerationStatus: 'skipped',
    };

    if (!alertData.possibleCause || !alertData.recommendedAction) {
      try {
        // Collect brief historical metrics if available
        let historicalMetrics = null;
        try {
          const filter = apiId ? { apiId } : { apiName };
          const recentChecks = await MonitoringCheck.find(filter)
            .sort({ checkedAt: -1 })
            .limit(5)
            .select('responseTimeMs statusCode success checkedAt');

          if (recentChecks && recentChecks.length > 0) {
            const validLatencies = recentChecks
              .map((c) => c.responseTimeMs)
              .filter((ms) => typeof ms === 'number');
            const avgLatency = validLatencies.length
              ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
              : null;
            const errorCount = recentChecks.filter((c) => !c.success).length;
            historicalMetrics = {
              recentChecksCount: recentChecks.length,
              recentErrorCount: errorCount,
              recentAvgLatencyMs: avgLatency,
            };
          }
        } catch (metricErr) {
          logger.debug({ err: metricErr.message }, 'Could not retrieve historical metrics for alert');
        }

        const anomalyPayload = {
          apiName,
          statusCode: alertData.metricsSnapshot?.statusCode ?? alertData.statusCode,
          responseTimeMs: alertData.metricsSnapshot?.responseTimeMs ?? alertData.responseTimeMs,
          recordsReturned: alertData.metricsSnapshot?.recordsReturned ?? alertData.recordsReturned,
          expectRecords: alertData.expectRecords,
          reasonCodes,
          severity,
          historicalMetrics,
        };

        const aiResult = await analyzeAnomaly(anomalyPayload);
        analysis = aiResult;
      } catch (diagErr) {
        logger.warn({ err: diagErr.message }, 'Diagnostic analysis generation failed, using default');
      }
    }

    // Create new alert document
    const newAlert = new Alert({
      apiId: apiId || null,
      apiName,
      severity,
      reasonCodes,
      summary: analysis.summary || summary,
      fingerprint,
      possibleCause: analysis.possibleCause,
      businessImpact: analysis.businessImpact,
      recommendedAction: analysis.recommendedAction,
      aiGenerated: analysis.aiGenerated ?? false,
      generationMethod: analysis.generationMethod ?? 'fallback',
      aiGenerationStatus: analysis.aiGenerationStatus ?? 'skipped',
      metricsSnapshot: alertData.metricsSnapshot || {},
      status: 'open',
      createdAt: new Date(),
      lastSeenAt: new Date(),
      occurrenceCount: 1,
    });

    await newAlert.save();
    logger.info({ fingerprint, alertId: newAlert._id, aiGenerated: newAlert.aiGenerated }, 'New alert created');
    return { alert: newAlert, isNew: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create or update alert');
    throw error;
  }
}

/**
 * Validated lifecycle state transitions.
 * - open -> acknowledged or resolved
 * - acknowledged -> resolved
 * - resolved -> terminal (cannot be transitioned back)
 */
const VALID_LIFECYCLE_TRANSITIONS = {
  open: ['acknowledged', 'resolved'],
  acknowledged: ['resolved'],
  resolved: [],
};

/**
 * Transition an alert to a new status with validation.
 *
 * @param {string} alertId
 * @param {'acknowledged'|'resolved'} newStatus
 * @returns {Promise<object>} Updated alert document
 */
async function updateAlertStatus(alertId, newStatus) {
  const alert = await Alert.findById(alertId);
  if (!alert) {
    const error = new Error('Alert not found');
    error.statusCode = 404;
    throw error;
  }

  const allowed = VALID_LIFECYCLE_TRANSITIONS[alert.status] || [];
  if (!allowed.includes(newStatus)) {
    const error = new Error(
      `Cannot transition alert from '${alert.status}' to '${newStatus}'. Allowed transitions: ${
        allowed.join(', ') || 'none (alert is resolved)'
      }`
    );
    error.statusCode = 400;
    throw error;
  }

  alert.status = newStatus;
  if (newStatus === 'acknowledged') {
    alert.acknowledgedAt = new Date();
  } else if (newStatus === 'resolved') {
    alert.resolvedAt = new Date();
  }

  await alert.save();
  logger.info({ alertId, status: newStatus }, `Alert transitioned to ${newStatus}`);
  return alert;
}

/**
 * Resolve an alert by ID.
 *
 * @param {string} alertId
 * @returns {Promise<object>} Updated alert document
 */
async function resolveAlert(alertId) {
  return updateAlertStatus(alertId, 'resolved');
}

/**
 * Acknowledge an alert by ID.
 *
 * @param {string} alertId
 * @returns {Promise<object>} Updated alert document
 */
async function acknowledgeAlert(alertId) {
  return updateAlertStatus(alertId, 'acknowledged');
}

module.exports = {
  generateFingerprint,
  createOrUpdateAlert,
  updateAlertStatus,
  resolveAlert,
  acknowledgeAlert,
  VALID_LIFECYCLE_TRANSITIONS,
};
