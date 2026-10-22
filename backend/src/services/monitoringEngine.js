/**
 * Monitoring Engine
 * Cron-based scheduler that periodically checks all enabled MonitoredAPIs.
 * Uses node-cron for scheduling, axios for HTTP requests.
 *
 * Security:
 * - Blocks private/localhost URLs in production (SSRF prevention)
 * - Does not forward arbitrary user headers
 * - Enforces per-request timeout
 */
const cron = require('node-cron');
const axios = require('axios');
const MonitoredAPI = require('../models/MonitoredAPI');
const MonitoringCheck = require('../models/MonitoringCheck');
const { detectAnomalies } = require('./anomalyDetector');
const { createOrUpdateAlert } = require('./alertService');
const logger = require('../config/logger');

// Map of apiId (string) → cron task
const scheduledTasks = new Map();

// In-memory lock set: apiIds currently being checked (prevents overlapping runs)
const runningChecks = new Set();

// ─── SSRF Protection ─────────────────────────────────────────────────────────

/**
 * Determine if a URL should be blocked (SSRF prevention).
 * In production: blocks localhost, private IP ranges, non-http(s) protocols.
 * In dev/test: allows all for testing convenience.
 *
 * @param {string} urlString
 * @returns {boolean} true if the URL should be blocked
 */
function isBlockedUrl(urlString) {
  // Only enforce in production
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    // Unparseable URL — block it
    return true;
  }

  const { hostname, protocol } = parsed;

  // Only allow http and https
  if (protocol !== 'http:' && protocol !== 'https:') {
    return true;
  }

  // Block localhost
  if (hostname === 'localhost') return true;

  // Block loopback IPv4 (127.x.x.x)
  if (hostname === '127.0.0.1' || hostname.startsWith('127.')) return true;

  // Block loopback IPv6
  if (hostname === '::1' || hostname === '[::1]') return true;

  // Block private Class A: 10.x.x.x
  if (hostname.startsWith('10.')) return true;

  // Block private Class B: 172.16.x.x – 172.31.x.x
  const parts = hostname.split('.');
  if (parts.length === 4 && parts[0] === '172') {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // Block private Class C: 192.168.x.x
  if (hostname.startsWith('192.168.')) return true;

  // Block link-local: 169.254.x.x
  if (hostname.startsWith('169.254.')) return true;

  return false;
}

// ─── HTTP Check Execution ─────────────────────────────────────────────────────

/**
 * Execute a single HTTP check for a MonitoredAPI document.
 *
 * @param {object} api - MonitoredAPI mongoose document
 * @returns {Promise<{ responseTimeMs: number, statusCode: number|null, success: boolean, errorMessage: string|null, recordsReturned: number|null }>}
 */
async function executeCheck(api) {
  // SSRF guard
  if (isBlockedUrl(api.url)) {
    return {
      responseTimeMs: 0,
      statusCode: null,
      success: false,
      errorMessage: `SSRF: Blocked URL target prohibited: ${api.url}`,
      recordsReturned: null,
    };
  }

  const startTime = process.hrtime.bigint();

  // Build request config
  const config = {
    method: (api.method || 'GET').toLowerCase(),
    url: api.url,
    timeout: api.timeoutMs || 10000,
    validateStatus: () => true, // Don't throw on non-2xx
    maxRedirects: 5,
    beforeRedirect: (options, responseDetails) => {
      const redirectUrl = responseDetails.headers?.location;
      if (redirectUrl && isBlockedUrl(redirectUrl)) {
        throw new Error(`SSRF: Redirect to blocked target prohibited: ${redirectUrl}`);
      }
    },
    headers: {},
  };

  // Attach configured headers (safe — no arbitrary user headers forwarded)
  if (api.headers) {
    const headersObj = api.headers instanceof Map
      ? Object.fromEntries(api.headers)
      : api.headers;
    config.headers = { ...headersObj };
  }

  // Attach body for methods that support it
  if (api.body && ['post', 'put', 'patch'].includes(config.method)) {
    config.data = api.body;
  }

  try {
    const response = await axios(config);
    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number((endTime - startTime) / BigInt(1000000));

    const statusCode = response.status;
    const success = statusCode < 400;

    // Try to count records if response is JSON array
    let recordsReturned = null;
    if (
      response.data &&
      typeof response.data === 'object' &&
      Array.isArray(response.data)
    ) {
      recordsReturned = response.data.length;
    } else if (
      response.data &&
      typeof response.data === 'object' &&
      typeof response.data.count === 'number'
    ) {
      recordsReturned = response.data.count;
    } else if (
      response.data &&
      typeof response.data === 'object' &&
      Array.isArray(response.data.data)
    ) {
      recordsReturned = response.data.data.length;
    }

    return { responseTimeMs, statusCode, success, errorMessage: null, recordsReturned };
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number((endTime - startTime) / BigInt(1000000));

    const errorMessage = error.message || 'Unknown error';
    return {
      responseTimeMs,
      statusCode: null,
      success: false,
      errorMessage,
      recordsReturned: null,
    };
  }
}

// ─── Result Processing ────────────────────────────────────────────────────────

/**
 * Process results of a check: run anomaly detection, save MonitoringCheck, create/update alert.
 *
 * @param {object} api - MonitoredAPI document
 * @param {object} checkResult - Result from executeCheck()
 */
async function processCheckResult(api, checkResult) {
  const { responseTimeMs, statusCode, success, errorMessage, recordsReturned } = checkResult;

  const checkData = { responseTimeMs, statusCode, recordsReturned, success, errorMessage };
  const anomalyResult = detectAnomalies(checkData, api);

  // Save MonitoringCheck
  const check = new MonitoringCheck({
    apiId: api._id,
    apiName: api.name,
    responseTimeMs,
    statusCode,
    recordsReturned,
    success,
    errorMessage,
    checkedAt: new Date(),
    anomalyDetected: anomalyResult.anomalyDetected,
    anomalyDetails: anomalyResult.details || null,
    reasonCodes: anomalyResult.reasonCodes,
    severity: anomalyResult.severity,
  });
  await check.save();

  if (anomalyResult.anomalyDetected) {
    try {
      await createOrUpdateAlert({
        apiId: api._id.toString(),
        apiName: api.name,
        severity: anomalyResult.severity,
        reasonCodes: anomalyResult.reasonCodes,
        summary: anomalyResult.details || `Anomaly detected for ${api.name}`,
        metricsSnapshot: {
          responseTimeMs,
          statusCode,
          recordsReturned,
        },
        expectRecords: api?.thresholds?.expectRecords,
      });
    } catch (alertErr) {
      logger.error({ err: alertErr, apiId: api._id }, 'Failed to create/update alert in engine');
    }
  }

  logger.debug(
    {
      apiId: api._id,
      apiName: api.name,
      statusCode,
      responseTimeMs,
      anomalyDetected: anomalyResult.anomalyDetected,
    },
    'Check processed'
  );
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

/**
 * Convert intervalSeconds into a node-cron expression.
 * - < 60s: use 6-field seconds-based cron: `*\/N * * * * *`
 * - >= 60s: use 5-field minute-based cron: `*\/M * * * *`
 *
 * @param {number} intervalSeconds
 * @returns {string} cron expression
 */
function buildCronExpression(intervalSeconds) {
  const seconds = Math.max(10, Math.min(3600, intervalSeconds));
  if (seconds < 60) {
    return `*/${seconds} * * * * *`;
  }
  const minutes = Math.floor(seconds / 60);
  return `*/${minutes} * * * *`;
}

/**
 * Schedule a single API for periodic checking using node-cron.
 * - Uses an in-memory lock to prevent overlapping checks.
 * - Skips if the API is disabled.
 *
 * @param {object} api - MonitoredAPI document
 */
function scheduleApi(api) {
  if (!api.enabled) {
    logger.debug({ apiId: api._id, name: api.name }, 'Skipping disabled API');
    return;
  }

  const apiIdStr = api._id.toString();

  // Unschedule any existing task first
  unscheduleApi(apiIdStr);

  const cronExpr = buildCronExpression(api.intervalSeconds || 60);

  const task = cron.schedule(cronExpr, async () => {
    if (runningChecks.has(apiIdStr)) {
      logger.debug({ apiId: apiIdStr }, 'Skipping overlapping check');
      return;
    }

    runningChecks.add(apiIdStr);
    try {
      // Check if URL is blocked (SSRF)
      if (isBlockedUrl(api.url)) {
        logger.warn({ apiId: apiIdStr, url: api.url }, 'SSRF: blocked URL, skipping check');
        return;
      }

      const checkResult = await executeCheck(api);
      await processCheckResult(api, checkResult);
    } catch (err) {
      logger.error({ err, apiId: apiIdStr }, 'Error during scheduled check');
    } finally {
      runningChecks.delete(apiIdStr);
    }
  });

  scheduledTasks.set(apiIdStr, task);
  logger.info({ apiId: apiIdStr, name: api.name, cronExpr }, 'API scheduled for monitoring');
}

/**
 * Unschedule a single API by ID.
 *
 * @param {string} apiId
 */
function unscheduleApi(apiId) {
  const task = scheduledTasks.get(apiId);
  if (task) {
    task.stop();
    scheduledTasks.delete(apiId);
    logger.info({ apiId }, 'API unscheduled');
  }
}

/**
 * Load all enabled APIs from DB and schedule them.
 * Called once on server startup after DB connects.
 */
async function initializeScheduler() {
  try {
    const apis = await MonitoredAPI.find({ enabled: true });
    logger.info({ count: apis.length }, 'Initializing monitoring scheduler');

    for (const api of apis) {
      scheduleApi(api);
    }

    logger.info('Monitoring scheduler initialized');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize monitoring scheduler');
    throw error;
  }
}

/**
 * Stop all scheduled tasks (for graceful shutdown).
 */
function stopAllSchedules() {
  logger.info({ count: scheduledTasks.size }, 'Stopping all scheduled tasks');
  for (const [apiId, task] of scheduledTasks) {
    task.stop();
    scheduledTasks.delete(apiId);
  }
  logger.info('All scheduled tasks stopped');
}

module.exports = {
  initializeScheduler,
  stopAllSchedules,
  scheduleApi,
  unscheduleApi,
  executeCheck,
  isBlockedUrl,
};
