/**
 * Monitoring Controller
 * Handles POST /api/v1/monitor — process monitoring check data,
 * run anomaly detection, persist results, and create/update alerts.
 */
const MonitoredAPI = require('../../models/MonitoredAPI');
const MonitoringCheck = require('../../models/MonitoringCheck');
const Alert = require('../../models/Alert');
const asyncHandler = require('../../utils/asyncHandler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { monitorBatchSchema } = require('./monitoring.schema');
const { detectAnomalies } = require('../../services/anomalyDetector');
const { createOrUpdateAlert } = require('../../services/alertService');
const logger = require('../../config/logger');

/**
 * POST /api/v1/monitor
 * Process single or batch monitoring check payloads.
 */
const processMonitorChecks = asyncHandler(async (req, res) => {
  const parsed = monitorBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 400, parsed.error.errors);
  }

  // Normalize to array
  const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  let anomaliesDetected = 0;
  const alertIds = [];
  const results = [];

  for (const item of items) {
    try {
      const {
        api_name,
        response_time_ms,
        status_code,
        records_returned,
        error_message,
        checked_at,
      } = item;

      // Derive success from status_code if not provided
      const success = item.success !== undefined ? item.success : status_code < 400;

      // Look up MonitoredAPI by name (case-insensitive)
      let monitoredApi = null;
      try {
        monitoredApi = await MonitoredAPI.findOne({
          name: { $regex: new RegExp(`^${api_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        });
      } catch (lookupErr) {
        logger.warn({ err: lookupErr, api_name }, 'Failed to look up MonitoredAPI');
      }

      // Build apiConfig from the found document or use empty defaults
      const apiConfig = monitoredApi || {};

      // Prepare check data for anomaly detection
      const checkData = {
        responseTimeMs: response_time_ms,
        statusCode: status_code,
        recordsReturned: records_returned !== undefined ? records_returned : null,
        success,
        errorMessage: error_message || null,
      };

      // Run anomaly detection
      const anomalyResult = detectAnomalies(checkData, apiConfig);

      // Save MonitoringCheck document
      const check = new MonitoringCheck({
        apiId: monitoredApi ? monitoredApi._id : null,
        apiName: api_name,
        responseTimeMs: response_time_ms,
        statusCode: status_code,
        recordsReturned: records_returned !== undefined ? records_returned : null,
        success,
        errorMessage: error_message || null,
        checkedAt: checked_at ? new Date(checked_at) : new Date(),
        anomalyDetected: anomalyResult.anomalyDetected,
        anomalyDetails: anomalyResult.details || null,
        reasonCodes: anomalyResult.reasonCodes,
        severity: anomalyResult.severity,
      });
      await check.save();

      const result = {
        api_name,
        anomalyDetected: anomalyResult.anomalyDetected,
        checkId: check._id.toString(),
      };

      // Create or update alert if anomaly detected
      if (anomalyResult.anomalyDetected) {
        anomaliesDetected++;
        result.severity = anomalyResult.severity;
        result.reasonCodes = anomalyResult.reasonCodes;

        try {
          const { alert } = await createOrUpdateAlert({
            apiId: monitoredApi ? monitoredApi._id.toString() : null,
            apiName: api_name,
            severity: anomalyResult.severity,
            reasonCodes: anomalyResult.reasonCodes,
            summary: anomalyResult.details || `Anomaly detected for ${api_name}`,
            metricsSnapshot: {
              responseTimeMs: response_time_ms,
              statusCode: status_code,
              recordsReturned: records_returned,
            },
            expectRecords: apiConfig?.thresholds?.expectRecords,
          });
          result.alertId = alert._id.toString();
          if (!alertIds.includes(alert._id.toString())) {
            alertIds.push(alert._id.toString());
          }
        } catch (alertErr) {
          logger.error({ err: alertErr, api_name }, 'Failed to create/update alert');
        }
      }

      results.push(result);
    } catch (itemErr) {
      logger.error({ err: itemErr, item }, 'Failed to process monitoring check item');
      results.push({
        api_name: item.api_name,
        anomalyDetected: false,
        error: itemErr.message,
        checkId: null,
      });
    }
  }

  return successResponse(res, {
    processed: items.length,
    anomaliesDetected,
    alerts: alertIds,
    results,
  }, 'Monitoring checks processed');
});

/**
 * GET /api/v1/monitor/history
 * Paginated history of monitoring checks.
 * Query params: apiId, api_name, from, to, page, limit
 */
const getCheckHistory = asyncHandler(async (req, res) => {
  const { apiId, api_name, from, to, page = 1, limit = 20 } = req.query;

  const filter = {};

  if (apiId) {
    filter.apiId = apiId;
  }

  if (api_name) {
    filter.apiName = { $regex: new RegExp(api_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
  }

  if (from || to) {
    filter.checkedAt = {};
    if (from) filter.checkedAt.$gte = new Date(from);
    if (to) filter.checkedAt.$lte = new Date(to);
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [checks, total] = await Promise.all([
    MonitoringCheck.find(filter).sort({ checkedAt: -1 }).skip(skip).limit(limitNum),
    MonitoringCheck.countDocuments(filter),
  ]);

  return successResponse(res, {
    checks,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * GET /api/v1/monitoring/summary
 * Dashboard aggregated summary of monitored APIs, 24h metrics, and active alerts.
 */
const getMonitoringSummary = asyncHandler(async (req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalApis,
    activeApis,
    totalChecks24h,
    successfulChecks24h,
    checksWithLatency,
    activeAlerts,
    alertsBySeverityAgg,
    recentAlerts,
  ] = await Promise.all([
    MonitoredAPI.countDocuments({}),
    MonitoredAPI.countDocuments({ enabled: true }),
    MonitoringCheck.countDocuments({ checkedAt: { $gte: since24h } }),
    MonitoringCheck.countDocuments({ checkedAt: { $gte: since24h }, success: true }),
    MonitoringCheck.aggregate([
      { $match: { checkedAt: { $gte: since24h }, responseTimeMs: { $type: 'number', $gte: 0 } } },
      { $group: { _id: null, avgLatency: { $avg: '$responseTimeMs' } } },
    ]),
    Alert.countDocuments({ status: { $in: ['open', 'acknowledged'] } }),
    Alert.aggregate([
      { $match: { status: { $in: ['open', 'acknowledged'] } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    Alert.find({ status: { $in: ['open', 'acknowledged'] } })
      .sort({ lastSeenAt: -1, createdAt: -1 })
      .limit(5),
  ]);

  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    warning: 0,
    low: 0,
  };
  (alertsBySeverityAgg || []).forEach((item) => {
    if (item._id && severityCounts[item._id] !== undefined) {
      severityCounts[item._id] = item.count;
    }
  });

  const avgLatencyMs =
    checksWithLatency && checksWithLatency.length > 0
      ? Math.round(checksWithLatency[0].avgLatency)
      : 0;

  const uptimePercent =
    totalChecks24h > 0
      ? Number(((successfulChecks24h / totalChecks24h) * 100).toFixed(2))
      : 100.0;

  return successResponse(res, {
    apis: {
      total: totalApis,
      active: activeApis,
      inactive: totalApis - activeApis,
    },
    metrics24h: {
      totalChecks: totalChecks24h,
      successfulChecks: successfulChecks24h,
      failedChecks: totalChecks24h - successfulChecks24h,
      uptimePercent,
      avgResponseTimeMs: avgLatencyMs,
    },
    alerts: {
      totalActive: activeAlerts,
      bySeverity: severityCounts,
      recent: recentAlerts || [],
    },
    generatedAt: new Date().toISOString(),
  }, 'Monitoring summary retrieved successfully');
});

module.exports = { processMonitorChecks, getCheckHistory, getMonitoringSummary };
